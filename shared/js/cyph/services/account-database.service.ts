import {Injectable} from '@angular/core';
import {LocalStorageService} from './local-storage.service';


/**
 * Account database service.
 */
@Injectable()
export class AccountDatabaseService {
	/** @ignore */
	private dummyKey (url: string, publicData: boolean, storage: boolean) : string {
		return `${url}_${publicData.toString()}_${storage.toString()}`;
	}

	/**
	 * Gets an item's value.
	 * @param url Path to item.
	 * @param publicData If true, validates the item's signature. Otherwise, decrypts the item.
	 * @param storage If true, uses Firebase Storage. Otherwise, uses Firebase Realtime Database.
	 */
	public async getItem (
		url: string,
		publicData: boolean = false,
		storage: boolean = false
	) : Promise<string> {
		const value	= await this.localStorageService.getItem(
			this.dummyKey(url, publicData, storage)
		);

		if (value === undefined) {
			throw new Error(`Failed to get item at ${url}.`);
		}

		return value;
	}

	/**
	 * Deletes an item.
	 * @param url Path to item.
	 * @param storage If true, uses Firebase Storage. Otherwise, uses Firebase Realtime Database.
	 */
	public async removeItem (
		url: string,
		storage: boolean = false
	) : Promise<void> {
		for (const publicData of [true, false]) {
			const success	= await this.localStorageService.removeItem(
				this.dummyKey(url, publicData, storage)
			);

			if (success) {
				return;
			}
		}

		throw new Error(`Failed to remove item at ${url}.`);
	}

	/**
	 * Sets an item's value.
	 * @param url Path to item.
	 * @param value Data to set.
	 * @param publicData If true, signs the item. Otherwise, encrypts the item.
	 * @param storage If true, uses Firebase Storage. Otherwise, uses Firebase Realtime Database.
	 */
	public async setItem (
		url: string,
		value: boolean|number|string,
		publicData: boolean = false,
		storage: boolean = false
	) : Promise<void> {
		const success	= await this.localStorageService.setItem(
			this.dummyKey(url, publicData, storage),
			value
		);

		if (!success) {
			throw new Error(`Failed to set item at ${url}.`);
		}
	}

	constructor (
		/** @ignore */
		private readonly localStorageService: LocalStorageService
	) {}
}
