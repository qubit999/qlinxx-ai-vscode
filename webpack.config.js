//@ts-check

'use strict';

const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node', // VS Code extensions run in a Node.js-context
  mode: 'none', // this leaves the source code as close as possible to the original

  entry: './src/extension.ts', // the entry point of this extension
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode' // the vscode-module is created on-the-fly and must be excluded
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log", // enables logging required for problem matchers
  },
};

const markedConfig = {
  mode: 'production', // enables minification and optimizations
  // Use the full path to marked's main file
  entry: require.resolve('marked'),
  output: {
    path: path.resolve(__dirname, 'dist', 'media', 'js'),
    filename: 'marked.min.js',
    libraryTarget: 'umd'
  },
  target: 'web',
};

const webviewConfig = {
  mode: 'production',
  entry: './src/static/js/webview.js',
  output: {
    path: path.resolve(__dirname, 'dist', 'media', 'js'),
    filename: 'webview.js',
    libraryTarget: 'umd'
  },
  target: 'web',
};

// Remove the old webviewCssConfig that used CopyWebpackPlugin and replace with asset module handling.
const webviewCssConfig = {
  mode: 'production',
  entry: './src/static/css/webview.css',
  output: {
    path: path.resolve(__dirname, 'dist', 'media', 'css'),
    filename: 'webview.css'
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        type: 'asset/resource',
        generator: {
          filename: '[name][ext]' // Output as webview.css
        }
      }
    ]
  },
  target: 'web'
};

module.exports = [ extensionConfig, markedConfig, webviewConfig, webviewCssConfig ];
