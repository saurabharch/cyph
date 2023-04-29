#!/usr/bin/env node

import * as cheerio from 'cheerio';
import fastSHA512 from 'fast-sha512';
import fs from 'fs';
import htmlMinifier from 'html-minifier';
import {mkdirp} from 'mkdirp';
import path from 'path';

export const pack = async (
	dir,
	inputPath,
	enableMinify,
	enableSRI,
	outputPath
) => {
	if (!inputPath) {
		throw new Error('Missing input path.');
	}
	if (enableSRI && !outputPath) {
		throw new Error('Cannot enable SRI without an output path specified.');
	}

	if (!dir) {
		dir = '.';
	}

	inputPath = path.join(dir, inputPath);
	outputPath = outputPath ? path.join(dir, outputPath) : undefined;

	const subresourceRoot = outputPath ? path.dirname(outputPath) : undefined;
	if (subresourceRoot !== undefined) {
		await mkdirp(subresourceRoot);
	}

	const html = fs.readFileSync(inputPath).toString();
	const $ = cheerio.load(html);

	const subresources = await Promise.all(
		Array.from(
			$('script[src], link[rel="stylesheet"][href]').map(
				async (_, elem) => {
					const $elem = $(elem);
					const tagName = $elem.prop('tagName').toLowerCase();

					const sri =
						enableSRI &&
						$elem.attr('websign-sri-disable') === undefined;

					const subresourcePath = $elem
						.attr(tagName === 'script' ? 'src' : 'href')
						.split('?')[0]
						.replace(/^\//, '');

					const content = fs
						.readFileSync(path.join(dir, subresourcePath))
						.toString()
						.replace(/\n\/\/# sourceMappingURL=.*?\.map/g, '')
						.replace(/\n\/*# sourceMappingURL=.*?\.map *\//g, '')
						.trim();

					return {
						$elem,
						content,
						sri,
						hash: (await fastSHA512.hash(content)).hex,
						subresourcePath,
						tagName
					};
				}
			)
		)
	);

	for (let subresource of subresources) {
		if (subresource.sri) {
			const subresourcePath = path.join(
				subresourceRoot,
				subresource.subresourcePath
			);
			const subresourcePathParent = path.parse(subresourcePath).dir;

			await mkdirp(subresourcePathParent);
			fs.writeFileSync(subresourcePath, subresource.content);
			fs.writeFileSync(`${subresourcePath}.srihash`, subresource.hash);
		}

		subresource.$elem.replaceWith(
			subresource.tagName === 'script' ?
				subresource.sri ?
					`
					<script
						websign-sri-path='${subresource.subresourcePath}'
						websign-sri-hash='${subresource.hash}'
					></script>
				` :
					`
					<script>${subresource.content.replace(/<\/script>/g, '<\\/script>')}</script>
				` :
			subresource.sri ?
				`
					<link
						rel='stylesheet'
						websign-sri-path='${subresource.subresourcePath}'
						websign-sri-hash='${subresource.hash}'
					></link>
				` :
				`
					<style>${subresource.content}</style>
				`
		);
	}

	const output = (html =>
		enableMinify ?
			htmlMinifier.minify(html, {
				collapseWhitespace: true,
				minifyCSS: false,
				minifyJS: false,
				removeComments: true
			}) :
			html)($.html().trim());

	if (outputPath) {
		fs.writeFileSync(outputPath, output);
	}

	return output;
};
