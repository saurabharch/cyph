/* eslint-disable max-lines */

import * as lz4 from 'lz4';
import memoize from 'lodash-es/memoize';
import {superSphincs as superSphincsLegacy} from 'supersphincs-legacy';
import {
	IKeyPair,
	IPotassiumData,
	IPrivateKeyring,
	IPublicKeyring,
	PotassiumData
} from '../../../proto';
import {retryUntilSuccessful} from '../../util/wait/retry-until-successful';
import {ISign} from './isign';
import {potassiumEncoding} from './potassium-encoding';
import {potassiumUtil} from './potassium-util';

/** @inheritDoc */
export class Sign implements ISign {
	/** @ignore */
	private readonly currentAlgorithmInternal = !this.isNative ?
		PotassiumData.SignAlgorithms.V1 :
		PotassiumData.SignAlgorithms.NativeV1;

	/** @see PotassiumEncoding.deserialize */
	private readonly defaultMetadata: IPotassiumData & {
		signAlgorithm: PotassiumData.SignAlgorithms;
	} = {
		signAlgorithm: PotassiumData.SignAlgorithms.V1
	};

	/** @inheritDoc */
	public readonly currentAlgorithm = Promise.resolve(
		this.currentAlgorithmInternal
	);

	/** @inheritDoc */
	public readonly getPrivateKeyBytes = memoize(
		async (
			algorithm: PotassiumData.SignAlgorithms = this
				.currentAlgorithmInternal
		) : Promise<number> => {
			switch (algorithm) {
				case PotassiumData.SignAlgorithms.NativeV1:
				case PotassiumData.SignAlgorithms.V1:
					return superSphincsLegacy.privateKeyBytes;

				default:
					throw new Error(
						'Invalid Sign algorithm (private key bytes).'
					);
			}
		}
	);

	/** @inheritDoc */
	public readonly getBytes = memoize(
		async (
			algorithm: PotassiumData.SignAlgorithms = this
				.currentAlgorithmInternal
		) : Promise<number> => {
			switch (algorithm) {
				case PotassiumData.SignAlgorithms.NativeV1:
				case PotassiumData.SignAlgorithms.V1:
					return superSphincsLegacy.bytes;

				default:
					throw new Error('Invalid Sign algorithm (bytes).');
			}
		}
	);

	/** @inheritDoc */
	public readonly getPublicKeyBytes = memoize(
		async (
			algorithm: PotassiumData.SignAlgorithms = this
				.currentAlgorithmInternal
		) : Promise<number> => {
			switch (algorithm) {
				case PotassiumData.SignAlgorithms.NativeV1:
				case PotassiumData.SignAlgorithms.V1:
					return superSphincsLegacy.publicKeyBytes;

				default:
					throw new Error(
						'Invalid Sign algorithm (public key bytes).'
					);
			}
		}
	);

	/** @inheritDoc */
	public async importPublicKeys (
		algorithm: PotassiumData.SignAlgorithms,
		classical: string,
		postQuantum: string
	) : Promise<Uint8Array> {
		let result: Uint8Array;

		switch (algorithm) {
			case PotassiumData.SignAlgorithms.NativeV1:
			case PotassiumData.SignAlgorithms.V1:
				result = (
					await superSphincsLegacy.importKeys({
						public: {rsa: classical, sphincs: postQuantum}
					})
				).publicKey;
				break;

			default:
				throw new Error('Invalid Sign algorithm (public key bytes).');
		}

		return potassiumEncoding.serialize({
			publicKey: result,
			signAlgorithm: algorithm
		});
	}

	/** @inheritDoc */
	public async keyPair (
		algorithm: PotassiumData.SignAlgorithms = this.currentAlgorithmInternal
	) : Promise<IKeyPair> {
		return retryUntilSuccessful(async () => {
			let result: IKeyPair;

			switch (algorithm) {
				case PotassiumData.SignAlgorithms.NativeV1:
				case PotassiumData.SignAlgorithms.V1:
					result = await superSphincsLegacy.keyPair();
					break;

				default:
					throw new Error('Invalid Sign algorithm (key pair).');
			}

			const testInput = potassiumUtil.randomBytes(32);
			if (
				!potassiumUtil.compareMemory(
					testInput,
					await this.open(
						await this.sign(testInput, result.privateKey),
						result.publicKey
					)
				)
			) {
				throw new Error('Corrupt Potassium.Sign key.');
			}

			return {
				privateKey: await potassiumEncoding.serialize({
					privateKey: result.privateKey,
					signAlgorithm: algorithm
				}),
				publicKey: await potassiumEncoding.serialize({
					publicKey: result.publicKey,
					signAlgorithm: algorithm
				})
			};
		});
	}

	/** @inheritDoc */
	public async open (
		signed: Uint8Array | string,
		publicKey: Uint8Array | IPublicKeyring,
		additionalData: Uint8Array | string = new Uint8Array(0),
		decompressByDefault: boolean = false
	) : Promise<Uint8Array> {
		publicKey = potassiumEncoding.openKeyring(
			PotassiumData.SignAlgorithms,
			publicKey,
			this.currentAlgorithmInternal
		);

		const potassiumPublicKey = await potassiumEncoding.deserialize(
			this.defaultMetadata,
			{publicKey}
		);

		const algorithm = potassiumPublicKey.signAlgorithm;

		const potassiumSigned = await potassiumEncoding.deserialize(
			this.defaultMetadata,
			{
				signed: {
					compressed: decompressByDefault,
					message: new Uint8Array(0),
					signature: potassiumUtil.fromBase64(signed),
					signatureBytes: await this.getBytes(algorithm)
				}
			}
		);

		if (potassiumSigned.signAlgorithm !== algorithm) {
			throw new Error(
				'Signature - public key Sign algorithm mismatch (open).'
			);
		}

		switch (algorithm) {
			case PotassiumData.SignAlgorithms.NativeV1:
			case PotassiumData.SignAlgorithms.V1:
				const message = potassiumSigned.signed.compressed ?
					lz4.decode(potassiumSigned.signed.message) :
					potassiumSigned.signed.message;

				if (
					!(await this.verifyDetached(
						potassiumSigned.signed.signature,
						message,
						potassiumPublicKey.publicKey,
						additionalData
					))
				) {
					throw new Error('Invalid signature.');
				}

				return message;

			default:
				throw new Error('Invalid Sign algorithm (open).');
		}
	}

	/** @inheritDoc */
	public async sign (
		message: Uint8Array | string,
		privateKey: Uint8Array | IPrivateKeyring,
		additionalData: Uint8Array | string = new Uint8Array(0),
		compress: boolean = false
	) : Promise<Uint8Array> {
		message = potassiumUtil.fromString(message);

		privateKey = potassiumEncoding.openKeyring(
			PotassiumData.SignAlgorithms,
			privateKey instanceof Uint8Array ? {privateKey} : privateKey,
			this.currentAlgorithmInternal
		).privateKey;

		const potassiumPrivateKey = await potassiumEncoding.deserialize(
			this.defaultMetadata,
			{privateKey}
		);

		const algorithm = potassiumPrivateKey.signAlgorithm;

		let result: Uint8Array;

		switch (algorithm) {
			case PotassiumData.SignAlgorithms.NativeV1:
			case PotassiumData.SignAlgorithms.V1:
				result = await superSphincsLegacy.signDetached(
					message,
					potassiumPrivateKey.privateKey,
					additionalData
				);
				break;

			default:
				throw new Error('Invalid Sign algorithm (sign).');
		}

		return potassiumEncoding.serialize({
			signAlgorithm: algorithm,
			signed: {
				compressed: compress,
				message: compress ?
					lz4.encode(message, {streamChecksum: false}) :
					message,
				signature: result
			}
		});
	}

	/** @inheritDoc */
	public async signDetached (
		message: Uint8Array | string,
		privateKey: Uint8Array | IPrivateKeyring,
		additionalData?: Uint8Array | string,
		rawOutput: boolean = false
	) : Promise<Uint8Array> {
		privateKey = potassiumEncoding.openKeyring(
			PotassiumData.SignAlgorithms,
			privateKey instanceof Uint8Array ? {privateKey} : privateKey,
			this.currentAlgorithmInternal
		).privateKey;

		const potassiumPrivateKey = await potassiumEncoding.deserialize(
			this.defaultMetadata,
			{privateKey}
		);

		const algorithm = potassiumPrivateKey.signAlgorithm;

		let result: Uint8Array;

		switch (algorithm) {
			case PotassiumData.SignAlgorithms.NativeV1:
			case PotassiumData.SignAlgorithms.V1:
				result = await superSphincsLegacy.signDetached(
					message,
					potassiumPrivateKey.privateKey,
					additionalData
				);
				break;

			default:
				throw new Error('Invalid Sign algorithm (sign detached).');
		}

		if (rawOutput) {
			return result;
		}

		return potassiumEncoding.serialize({
			signature: result,
			signAlgorithm: algorithm
		});
	}

	/** @inheritDoc */
	public async verifyDetached (
		signature: Uint8Array | string,
		message: Uint8Array | string,
		publicKey: Uint8Array | IPublicKeyring,
		additionalData?: Uint8Array | string
	) : Promise<boolean> {
		publicKey = potassiumEncoding.openKeyring(
			PotassiumData.SignAlgorithms,
			publicKey,
			this.currentAlgorithmInternal
		);

		const potassiumPublicKey = await potassiumEncoding.deserialize(
			this.defaultMetadata,
			{publicKey}
		);
		const potassiumSignature = await potassiumEncoding.deserialize(
			this.defaultMetadata,
			{signature: potassiumUtil.fromBase64(signature)}
		);

		const algorithm = potassiumPublicKey.signAlgorithm;

		if (potassiumSignature.signAlgorithm !== algorithm) {
			throw new Error(
				'Signature - public key Sign algorithm mismatch (verify).'
			);
		}

		switch (algorithm) {
			case PotassiumData.SignAlgorithms.NativeV1:
			case PotassiumData.SignAlgorithms.V1:
				return superSphincsLegacy.verifyDetached(
					potassiumSignature.signature,
					message,
					potassiumPublicKey.publicKey,
					additionalData
				);

			default:
				throw new Error('Invalid Sign algorithm (verify).');
		}
	}

	constructor (
		/** @ignore */
		private readonly isNative: boolean
	) {}
}
