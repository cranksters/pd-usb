import { version } from './package.json';
import alias from '@rollup/plugin-alias';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonJs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import typescript from 'rollup-plugin-typescript2';
import { terser } from 'rollup-plugin-terser';
import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';
import bundleSize from 'rollup-plugin-bundle-size';

const build = process.env.BUILD || 'development';
const devserver = process.env.DEV_SERVER || false;
const isEsmoduleBuild = process.env.ES_MODULE || false;
const isProdBuild = build === 'production';

const banner = `/*!!
pd-usb v${ version }
JavaScript library for interacting with a Panic Playdate console over USB
https://github.com/jaames/pd-usb
2022 James Daniel
Playdate is (c) Panic Inc. - this project isn't affiliated with or endorsed by them in any way
*/`;

module.exports = {
  input: [
    'src/index.ts'
  ],
  output: [
    (isEsmoduleBuild) && {
      file: 'dist/pd-usb.es.js',
      format: 'es',
      name: 'pdusb',
      exports: 'named',
      banner: banner,
      sourcemap: devserver ? true : false,
      sourcemapFile: 'dist/pd-usb.es.map'
    },
    (!isEsmoduleBuild) && {
      file: isProdBuild ? 'dist/pd-usb.min.js' : 'dist/pd-usb.js',
      format: 'umd',
      name: 'pdusb',
      exports: 'named',
      banner: banner,
      sourcemap: devserver ? true : false,
      sourcemapFile: isProdBuild ? 'dist/pd-usb.min.js.map' : 'dist/pd-usb.js.map'
    },
  ].filter(Boolean),
  plugins: [
    nodeResolve({
      // browser: true
    }),
    commonJs(),
    alias({
      resolve: ['.jsx', '.js', '.ts', '.tsx'],
    }),
    replace({
      preventAssignment: true,
      LIBRARY_VERSION: JSON.stringify(version),
      PROD: isProdBuild ? 'true' : 'false',
      DEV_SERVER: devserver ? 'true' : 'false',
      // https://github.com/PolymerLabs/lit-element-starter-ts/blob/master/rollup.config.js
      'Reflect.decorate': 'undefined'
    }),
    typescript({
      abortOnError: false,
      typescript: require('typescript'),
      tsconfigOverride: {
        compilerOptions: {
          target: (() => {
            if (isEsmoduleBuild)
              return 'es2020';
            else
              return 'es6';
          })(),
          declaration: !devserver ? true : false,
          sourceMap: devserver ? true : false,
        },
      },
    }),
    bundleSize(),
    // devserver + livereload
    devserver && serve({
      contentBase: ['dist', 'examples']
    }),
    devserver && livereload({
      watch: 'dist'
    }),
    // only minify if we're producing a non-es production build
    isProdBuild && !isEsmoduleBuild && terser({
      // preserve banner comment
      output: {
        comments: function(node, comment) {
          if (comment.type === 'comment2') {
            return /\!\!/i.test(comment.value);
          }
          return false;
        }
      }
    })
  ].filter(Boolean)
};