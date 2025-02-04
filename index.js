const fileswatch  = 'html,htm,txt,json,md,woff2',
      imageswatch = 'jpg,jpeg,png,svg,gif,webp',
      minifyimg   = true

// TAILWIND OPTIONAL (npm i -D @tailwindcss/postcss):
// import tailwindcss from '@tailwindcss/postcss'

import fs               from 'fs-extra'
import { glob }         from 'glob'
import postcss          from 'postcss'
import postimport       from 'postcss-import'
import postnested       from 'postcss-nested'
import postapply        from 'postcss-apply'
import cssnano          from 'cssnano'
import imagemin         from 'imagemin'
import { rollup }       from 'rollup'
import terser           from '@rollup/plugin-terser'
import imageminJpegtran from 'imagemin-jpegtran'
import imageminPngquant from 'imagemin-pngquant'
import imageminMozjpeg  from 'imagemin-mozjpeg'
import imageminSvgo     from 'imagemin-svgo'
import chokidar         from 'chokidar'
import http             from 'browser-sync'
import ssi              from 'ssi'

function server() {
	return http.init({
		server: 'dist/',
		notify: false,
		open: false
	})
}

function styles() {
	return postcss([
		postimport,
		cssnano,
		...(typeof tailwindcss !== 'undefined' ? [tailwindcss] : [postapply, postnested])
	])
	.process(fs.readFileSync('app/css/index.css'), { from: 'app/css/index.css', to: 'dist/css/app.min.css' })
	.then(result => {
		if (!fs.existsSync('dist/css')) { fs.mkdirSync('dist/css', { recursive: true }) }
		fs.writeFile('dist/css/app.min.css', result.css, err => {
			if (err) { console.error('Error writing file:', err) }
		})
	}).catch(err => { console.error('Error in PostCSS:', err.message || err) })
}

function scripts() {
	return rollup({
		input: 'app/js/app.js',
		plugins: [
			terser()
		]
	})
	.then(bundle => { return bundle.write({ file: 'dist/js/app.min.js' }) })
	.catch(err => { console.error('Error building scripts:', err.message || err) })
}

async function buildhtml() {
	try {
		await new ssi('app/', 'dist/', '/**/*.html').compile()
	} catch (err) {
		console.error('Error compiling SSI:', err.message || err)
	}
	try {
		fs.rmSync('dist/parts', { recursive: true, force: true })
	} catch (err) {
		console.error('Error deleting dist/parts:', err.message || err)
	}
}

async function buildimg() {
	if (minifyimg) {
		try {
			const files = await imagemin([`app/img/**/*.{${imageswatch}}`], {
				plugins: [
					imageminJpegtran({ progressive: true }),
					imageminMozjpeg({ quality: 90 }),
					imageminPngquant({ quality: [0.6, 0.8] }),
					imageminSvgo()
				]
			})
			for (const v of files) {
					const source = path.parse(v.sourcePath)
					const destPath = `${source.dir.replace('app/img', 'dist/img')}/${source.name}${source.ext}`

					try {
							await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
							await fs.promises.writeFile(destPath, v.data)
							console.log(`Image saved: ${destPath}`)
					} catch (error) {
							console.error(`Error processing image ${v.sourcePath}:`, error.message)
					}
			}
		} catch (error) {
				console.error('Error minifying images:', error.message)
		}
	} else { cpimg() }
}

function cpfonts() { copyFiles('app/fonts', 'dist/fonts') }
function cpimg()   { copyFiles('app/img', 'dist/img') }

async function build() {

	fs.rmSync('dist/', { recursive: true, force: true })

	await styles()
	await scripts()
	await buildimg()
	await buildhtml()
	await cpfonts()

	await console.log('', 'Ready!', '\n')

}

chokidar.watch(await glob(['app/css/**/*.css', '!app/css/**/*.min.css'])).on('all', async () => { await styles(); await http.reload('dist/css/app.min.css') })
chokidar.watch(await glob(['app/*.html', 'app/parts/**/*'])).on('all', async () => { await buildhtml(); await http.reload() })
chokidar.watch(await glob(['app/js/**/*.js'])).on('all', async () => { await scripts(); await http.reload() })
chokidar.watch(await [`app/fonts/`]).on('all', async () => { await cpfonts() })
chokidar.watch(await [`app/img/`]).on('all', async () => { await cpimg() })
chokidar.watch(await glob([`app/**/*.{${fileswatch}}`])).on('all', async () => { typeof tailwindcss !== 'undefined' ? (await styles(), await http.reload()) : await http.reload() })

function copyFiles(src, dest) {
	fs.cp(src, dest, { recursive: true }, (err) => { /* if (err) console.error(err) */ })
}

export let startServer = server
export let buildAll    = build
