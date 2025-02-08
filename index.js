const tailwindcss = false; // npm i -D @tailwindcss/cli
const minifyimg   = true;

import postcss          from 'postcss';
import postimport       from 'postcss-import';
import postnested       from 'postcss-nested';
import postapply        from 'postcss-apply';
import cssnano          from 'cssnano';
import imagemin         from 'imagemin';
import imageminJpegtran from 'imagemin-jpegtran';
import imageminMozjpeg  from 'imagemin-mozjpeg';
import imageminPngquant from 'imagemin-pngquant';
import imageminSvgo     from 'imagemin-svgo';
import { rollup }       from 'rollup';
import terser           from '@rollup/plugin-terser';
import resolve          from '@rollup/plugin-node-resolve';
import chokidar         from 'chokidar';
import http             from 'browser-sync';
import bssi             from 'browsersync-ssi';
import { exec }         from 'child_process';
import { glob }         from 'glob';
import fs               from 'fs-extra';
import path             from 'path';
import ssi              from 'ssi';

async function tailwind(watch = false) {
	const command = `npx tailwindcss -i ./tailwind.css -o ./app/css/tailwind.css --minify${watch ? ' --watch' : ''} --content './app/**/*.html'`;
	if (!watch) {
		return new Promise((resolve, reject) => {
			exec(command, (error, stdout, stderr) => {
				if (error) {
					console.error(`❌ Tailwind CSS Error: ${error.message}`);
					reject(error);
					return;
				}
				console.log(`✅ Tailwind CSS compiled successfully.`);
				resolve();
			});
		});
	} else { exec(command); }
}

function noTailwind() {
	if (!tailwindcss) {
		try {
			fs.rmSync('app/css/tailwind.css', { recursive: true, force: true });
		} catch (err) {
			console.error('❌ Failed to remove tailwind.css:', err.message);
		}
	}
}

async function styles() {
	try {
		if (tailwindcss) { await tailwind(false); } else { noTailwind() }
		const result = await postcss([
			postimport,
			postapply,
			postnested,
			cssnano({ preset: ['default', { discardComments: { removeAll: true } }] })
		]).process(fs.readFileSync('app/css/index.css'), {
			from: 'app/css/index.css',
			to: 'dist/css/index.css',
			map: false
		});
		fs.ensureDirSync('dist/css');
		fs.writeFileSync('dist/css/index.css', result.css);
		console.log('✅ CSS processed successfully.');
	} catch (err) {
		console.error('❌ PostCSS Error:', err.message || err);
	}
}

async function scripts() {
	try {
		const bundle = await rollup({
			input: 'app/js/app.js',
			plugins: [resolve(), terser()],
		});
		fs.mkdirSync('dist/js', { recursive: true });
		await bundle.write({ file: 'dist/js/app.js' });
		console.log('✅ Scripts compiled successfully!');

		const htmlFiles = fs.readdirSync('dist').filter(file => file.endsWith('.html'));
		for (const file of htmlFiles) {
			const filePath = path.join('dist', file);
			let htmlContent = fs.readFileSync(filePath, 'utf8');
			htmlContent = htmlContent.replace(/<script\s+type="module"/g, '<script defer');
			fs.writeFileSync(filePath, htmlContent, 'utf8');
			console.log(`✅ Updated ${file}: replaced type="module" with defer`);
		}
	} catch (err) {
		console.error('❌ Error in scripts function:', err.message || err);
	}
}

async function buildhtml() {
	try {
		await new ssi('app/', 'dist/', '/**/*.html').compile();
		fs.rmSync('dist/parts', { recursive: true, force: true });
		console.log('✅ HTML compiled successfully.');
	} catch (err) {
		console.error('❌ SSI Compilation Error:', err.message || err);
	}
}

async function buildimg() {
	if (!minifyimg) return copyFiles('app/img', 'dist/img');
	try {
		const files = await imagemin([`app/img/**/*`], {
			plugins: [
				imageminJpegtran({ progressive: true }),
				imageminMozjpeg({ quality: 90 }),
				imageminPngquant({ quality: [0.6, 0.8] }),
				imageminSvgo()
			]
		});
		for (const v of files) {
			const relativePath = path.relative('app/img', v.sourcePath);
			const destPath = path.join('dist/img', relativePath);
			fs.ensureDirSync(path.dirname(destPath));
			fs.writeFileSync(destPath, v.data);
		}
		console.log('✅ Images optimized successfully.');
	} catch (err) {
		console.error('❌ Image Minification Error:', err.message || err);
	}
}

function copyFiles(src, dest) {
	fs.copySync(src, dest, { recursive: true });
	console.log(`✅ Copied files from ${src} to ${dest}`);
}

async function build() {
	fs.rmSync('dist/', { recursive: true, force: true });
	await buildhtml();
	await styles();
	await scripts();
	await buildimg();
	copyFiles('app/fonts', 'dist/fonts');
	console.log('✅ Build process completed.');
}

async function native() {
	fs.rmSync('dist/', { recursive: true, force: true });
	await buildhtml();
	if (tailwindcss) { await tailwind(false); } else { noTailwind() }
	copyDevAssets('app/css', 'dist/css');
	copyDevAssets('app/js', 'dist/js');
	copyFiles('app/fonts', 'dist/fonts');
	copyFiles('app/img', 'dist/img');
	copyFiles('app/libs', 'dist/libs');
}

async function server() {
	if (tailwindcss) { await tailwind(true); } else { noTailwind() }
	http.init({
		server: { baseDir: 'app/', routes: { '/node_modules': path.resolve(__dirname, 'node_modules') } },
		middleware: bssi({ baseDir: 'app/', ext: '.html' }),
		notify: false,
		open: false
	});
	watch();
}

async function watch() {
	chokidar.watch(glob.sync(['app/js/**/*.js', 'app/libs/**/*.js'])).on('all', async () => { http.reload('dist/js/app.js') });
	chokidar.watch(glob.sync(['app/css/**/*.css'])).on('all', async () => { http.reload('dist/css/index.css') });
	chokidar.watch(glob.sync(['app/*.html', 'app/parts/**/*'])).on('all', async () => { http.reload() });
	chokidar.watch(glob.sync(['app/fonts/**/*', 'app/img/**/*'])).on('all', async () => { http.reload() });
	if (tailwindcss) { chokidar.watch(glob.sync(['tailwind.css'])).on('all', async () => { await tailwind(false), http.reload('dist/css/index.css') }) };
}

const copyDevAssets = (sourceDir, destDir) => {

	const copyNodeModules = (moduleName) => {
		const sourceModulePath = path.join('node_modules', moduleName);
		const destModulePath = path.join('dist', 'node_modules', moduleName);
		if (fs.existsSync(sourceModulePath) && !fs.existsSync(destModulePath)) {
			fs.mkdirSync(destModulePath, { recursive: true });
			fs.cpSync(sourceModulePath, destModulePath, { recursive: true });
			console.log(`📦 Library ${moduleName} copied to dist/node_modules`);
		} else if (!fs.existsSync(sourceModulePath)) {
			console.log(`⚠️ Module ${moduleName} not found in node_modules`);
		}
	};

	fs.readdir(sourceDir, (err, files) => {
		if (err) return console.error('❌ Error reading directory:', err);
		files.forEach((file) => {
			const sourceFilePath = path.join(sourceDir, file);
			const destFilePath = path.join(destDir, file);
			fs.stat(sourceFilePath, (err, stats) => {
				if (err) return console.error('❌ Error getting file information:', err);
				if (stats.isFile()) {
					const destDirPath = path.dirname(destFilePath);
					if (!fs.existsSync(destDirPath)) fs.mkdirSync(destDirPath, { recursive: true });
					fs.readFile(sourceFilePath, 'utf8', (err, data) => {
						if (err) return console.error('❌ Error reading file:', err);
						const cleanedData = data.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
						const updatedData = cleanedData.replace(/(\.\.\/)+node_modules/g, (match) => {
							const levels = match.split('/').length - 2;
							return '../'.repeat(levels) + 'node_modules';
						});
						if (updatedData !== data) {
							const matches = [...updatedData.matchAll(/node_modules\/([a-zA-Z0-9-_]+)/g)];
							matches.forEach(match => copyNodeModules(match[1]));
							fs.writeFile(destFilePath, updatedData, 'utf8', (err) => {
								if (err) return console.error('❌ Error writing file:', err);
								console.log(`✅ File updated and copied: ${destFilePath}`);
							});
						} else {
							fs.copyFileSync(sourceFilePath, destFilePath);
							console.log(`✅ File copied: ${destFilePath}`);
						}
					});
				}
			});
		});
	});

}

export { build, server, native };
