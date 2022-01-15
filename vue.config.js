const path = require('path');
module.exports = {
  chainWebpack: config => {
    config.module
      .rule('supportChaining')
      .test(/\.js$/)
        .include
          .add(path.resolve('node_modules/pdfjs-dist'))
          .end()
      .use('babel-loader')
        .loader('babel-loader')
        .tap(options => ({ ...options, 
          plugins : ['@babel/plugin-proposal-optional-chaining']
        }))
        .end()
    }
};