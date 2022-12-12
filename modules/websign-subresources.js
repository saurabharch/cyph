#!/usr/bin/env node

import {util} from '@cyph/sdk';
import fastSHA512 from 'fast-sha512';
import fs from 'fs/promises';
import glob from 'glob/sync.js';
import path from 'path';
import {getCDNRepo} from './cdn-repo.js';
import {brotli, gzip} from './compression.js';
import {ipfsAdd} from './ipfs.js';
import {ipfsWarmUpGateways} from './ipfs-gateways.js';

const {lockFunction} = util;

const gitCommitLock = lockFunction();

export const publishSubresources = async ({
	customBuilds = [],
	packageName,
	subresources,
	test = false
}) => {
	const cdnRepo = await getCDNRepo();

	const packageParent = test ? path.join('websign', 'test') : '';
	const packageFullPath = path.join(dir, packageParent, packageName);

	await Promise.all(
		Object.entries(subresources).map(async ([subresource, content]) => {
			const buf = Buffer.from(content);

			const [brotliEncoded, gzipEncoded, sriHash] = await Promise.all([
				brotli.encode(buf),
				gzip.encode(buf),
				fastSHA512.hash(buf).then(o => o.hex)
			]);

			const ipfsHash = await ipfsAdd(brotliEncoded);

			await gitCommitLock(async () => {
				for (const [ext, contentToAdd] of [
					['br', brotliEncoded],
					['gz', gzipEncoded],
					['ipfs', ipfsHash]
				]) {
					await cdnRepo.add(
						path.join(
							packageParent,
							packageName,
							`${subresource}.${ext}`
						),
						contentToAdd
					);
				}

				await cdnRepo.commit(sriHash);
			});
		})
	);

	for (const customBuild of customBuilds) {
		for (const subresource of Object.keys(subresources)) {
			for (const ext of ['br', 'gz', 'ipfs']) {
				const fileName = `${subresource}.${ext}`;
				const filePath = path.join(
					packageParent,
					customBuild,
					fileName
				);

				await fs.symlink(
					path.join('..', packageName, fileName),
					path.join(dir, filePath)
				);

				await cdnRepo.add(filePath);
			}
		}

		await cdnRepo.commit(customBuild);
	}

	for (const p of [packageName, ...customBuilds]) {
		for (const specialCaseTLD of ['app', 'ws']) {
			const pAlias = p.replace(new RegExp(`\\.${specialCaseTLD}$`), '');

			if (p === pAlias) {
				continue;
			}

			const pAliasFullPath = path.join(dir, packageParent, pAlias);
			const pAliasExists = await fs
				.access(pAliasFullPath)
				.then(() => true)
				.catch(() => false);

			if (pAliasExists) {
				continue;
			}

			await fs.symlink(path.join('..', packageName), pAliasFullPath);

			await cdnRepo.add(pAlias);
			await cdnRepo.commit(pAlias);
		}
	}

	await cdnRepo.push();

	const ipfsFiles = glob(path.join(packageFullPath, '**', '*.ipfs'), {
		nodir: true
	});

	await ipfsWarmUpGateways(
		await Promise.all(
			ipfsFiles.map(async ipfsFile =>
				(await fs.readFile(ipfsFile)).toString().trim()
			)
		)
	);
};
