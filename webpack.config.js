const path = require('path');

module.exports = [{
  name: 'default',
  entry: './src/visualizer/InitTokenVisualizer.ts', // Entry point file
  output: {
    filename: 'bundle.js', // Output bundle file
    path: path.resolve(__dirname, 'bundle'), // Output directory
    library: "WebASTParser", // Output to a library (WebASTParser) to be used in browser
    libraryTarget: 'umd'
  },
  devtool: 'source-map', // Enable sourcemaps for debugging
  resolve: {
    extensions: ['.ts', '.js'], // Add '.ts' and '.js' as resolvable extensions.
  },
  module: {
    rules: [
      {
        test: /\.ts$/, // Identify TypeScript files
        use: 'ts-loader',
        exclude: /node_modules/,
      }
    ]
  }
}];