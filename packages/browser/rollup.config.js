import { terser } from 'rollup-plugin-terser';
import typescript from 'rollup-plugin-typescript2';
import license from 'rollup-plugin-license';
import replace from '@rollup/plugin-replace';

const commitHash = require('child_process').execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();

const terserInstance = terser({
  compress: {
    // Tell env.ts that we're building a browser bundle and that we do not
    // want to have unnecessary debug functionality.
    global_defs: {
      __SENTRY_NO_DEBUG__: false,
    },
  },
  mangle: {
    // captureExceptions and captureMessage are public API methods and they don't need to be listed here
    // as mangler doesn't touch user-facing thing, however sentryWrapped is not, and it would be mangled into a minified version.
    // We need those full names to correctly detect our internal frames for stripping.
    // I listed all of them here just for the clarity's sake, as they are all used in the frame-manipulation process.
    reserved: ['captureException', 'captureMessage', 'sentryWrapped'],
    properties: {
      regex: /^_[^_]/,
      // This exclusion prevents most of the occurrences of the bug linked below:
      // https://github.com/getsentry/sentry-javascript/issues/2622
      // The bug is caused by multiple SDK instances, where one is minified and one is using non-mangled code.
      // Unfortunatelly we cannot fix it reliably (thus `typeof` check in the `InboundFilters` code),
      // as we cannot force people using multiple instances in their apps to sync SDK versions.
      reserved: ['_mergeOptions'],
    },
  },
  output: {
    comments: false,
  },
});

const paths = {
  '@sentry/utils': ['../utils/src'],
  '@sentry/core': ['../core/src'],
  '@sentry/hub': ['../hub/src'],
  '@sentry/types': ['../types/src'],
  '@sentry/minimal': ['../minimal/src'],
};

const plugins = [
  typescript({
    tsconfig: 'tsconfig.esm.json',
    tsconfigOverride: {
      compilerOptions: {
        declaration: false,
        declarationMap: false,
        paths,
        baseUrl: '.',
      },
    },
    include: ['*.ts+(|x)', '**/*.ts+(|x)', '../**/*.ts+(|x)'],
  }),
  replace({
    // don't replace `__placeholder__` where it's followed immediately by a single `=` (to prevent ending up
    // with something of the form `let "replacementValue" = "some assigned value"`, which would cause a
    // syntax error)
    preventAssignment: true,
    // the replacements to make
    values: {
      __SENTRY_BROWSER_BUNDLE__: true,
    },
  }),
];

const bundleConfig = {
  input: 'src/index.ts',
  output: {
    format: 'iife',
    name: 'Sentry',
    sourcemap: true,
    strict: false,
    esModule: false,
  },
  context: 'window',
  plugins: [
    ...plugins,
    license({
      sourcemap: true,
      banner: `/*! @sentry/browser <%= pkg.version %> (${commitHash}) | https://github.com/getsentry/sentry-javascript */`,
    }),
  ],
  treeshake: {
    annotations: true,
    correctVarValueBeforeDeclaration: false,
    moduleSideEffects: () => false,
    propertyReadSideEffects: false,
    tryCatchDeoptimization: false,
    unknownGlobalSideEffects: false,
  },
};

export default [
  // ES5 Browser Bundle
  {
    ...bundleConfig,
    output: {
      ...bundleConfig.output,
      file: 'build/bundle.js',
    },
  },
  {
    ...bundleConfig,
    output: {
      ...bundleConfig.output,
      file: 'build/bundle.min.js',
    },
    // Uglify has to be at the end of compilation, BUT before the license banner
    plugins: bundleConfig.plugins.slice(0, -1).concat(terserInstance).concat(bundleConfig.plugins.slice(-1)),
  },
  // ------------------
  // ES6 Browser Bundle
  {
    ...bundleConfig,
    output: {
      ...bundleConfig.output,
      file: 'build/bundle.es6.js',
    },
    plugins: [
      typescript({
        tsconfig: 'tsconfig.esm.json',
        tsconfigOverride: {
          compilerOptions: {
            declaration: false,
            declarationMap: false,
            paths,
            baseUrl: '.',
            target: 'es6',
          },
        },
        include: ['*.ts+(|x)', '**/*.ts+(|x)', '../**/*.ts+(|x)'],
      }),
      ...plugins.slice(1).concat(bundleConfig.plugins.slice(-1)),
    ],
  },
  {
    ...bundleConfig,
    output: {
      ...bundleConfig.output,
      file: 'build/bundle.es6.min.js',
    },
    plugins: [
      typescript({
        tsconfig: 'tsconfig.esm.json',
        tsconfigOverride: {
          compilerOptions: {
            declaration: false,
            declarationMap: false,
            paths,
            baseUrl: '.',
            target: 'es6',
          },
        },
        include: ['*.ts+(|x)', '**/*.ts+(|x)', '../**/*.ts+(|x)'],
      }),
      ...plugins.slice(1).slice(0, -1).concat(terserInstance).concat(bundleConfig.plugins.slice(-1)),
    ],
  },
  // ------------------
];
