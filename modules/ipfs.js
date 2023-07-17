#!/usr/bin/env node

import {util} from '@cyph/sdk';
import {unixfs as heliaUnixfs} from '@helia/unixfs';
import {MemoryBlockstore} from 'blockstore-core';
import fs from 'fs/promises';
import {createHelia} from 'helia';
import os from 'os';
import path from 'path';
import {fetch, FormData} from './fetch.js';

const {lockFunction, retryUntilSuccessful} = util;

const defaultCredentials = {
	eternum: await fs
		.readFile(path.join(os.homedir(), '.cyph', 'eternum.key'))
		.then(buf => buf.toString().trim())
		.catch(() => undefined),
	pinata: await fs
		.readFile(path.join(os.homedir(), '.cyph', 'pinata.key'))
		.then(buf => buf.toString().trim())
		.catch(() => undefined)
};

const locks = {
	eternum: lockFunction(),
	pinata: lockFunction()
};

const cloneBuffer = buf => {
	const bufCopy = Buffer.alloc(buf.length);
	buf.copy(bufCopy);
	return bufCopy;
};

const [ipfsInternal, ipfsHashOnly] = await Promise.all([
	createHelia().then(helia => heliaUnixfs(helia)),
	createHelia({
		blockstore: new MemoryBlockstore()
	}).then(helia => heliaUnixfs(helia))
]);

export const ipfs = ipfsInternal;

export const ipfsAdd = async (content, credentials = defaultCredentials) => {
	content = typeof content === 'string' ? Buffer.from(content) : content;

	if (!(content instanceof Buffer)) {
		throw new Error('Content to add to IPFS not defined.');
	}

	if (
		credentials?.eternum === undefined ||
		credentials?.pinata === undefined
	) {
		throw new Error('Missing IPFS pinning credentials.');
	}

	const hash = await retryUntilSuccessful(async () =>
		(await ipfs.addBytes(cloneBuffer(content), {cidVersion: 0}))
			.toV0()
			.toString()
	);

	if (content.length < 1) {
		return hash;
	}

	await retryUntilSuccessful(async () => {
		const formData = new FormData();
		formData.append(
			'file',
			new Blob([cloneBuffer(content)], {type: 'application/octet-stream'})
		);
		formData.append('pinataOptions', JSON.stringify({cidVersion: 0}));

		const {IpfsHash: pinataHash} = await locks.pinata(async () =>
			fetch(
				'https://api.pinata.cloud/pinning/pinFileToIPFS',
				{
					body: formData,
					headers: {
						Authorization: `Bearer ${credentials.pinata}`
					},
					method: 'POST'
				},
				'json'
			)
		);

		if (pinataHash === hash) {
			return;
		}

		throw new Error(
			`Pinata hash mismatch. Expected: ${hash}. Actual: ${pinataHash}.`
		);
	});

	await retryUntilSuccessful(async () =>
		locks.eternum(async () =>
			fetch('https://www.eternum.io/api/pin', {
				body: JSON.stringify({hash}),
				headers: {
					'Authorization': `Token ${credentials.eternum}`,
					'Content-Type': 'application/json'
				},
				method: 'POST'
			})
		)
	);

	return hash;
};

export const ipfsCalculateHash = async content => {
	content = typeof content === 'string' ? Buffer.from(content) : content;

	if (content === undefined) {
		throw new Error('Content to calculate to IPFS hash for not defined.');
	}

	return retryUntilSuccessful(async () =>
		(await ipfsHashOnly.addBytes(content, {cidVersion: 0}))
			.toV0()
			.toString()
	);
};
