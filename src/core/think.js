'use strict';

import fs from 'fs';
import path from 'path';
import util from 'util';
import crypto from 'crypto';
import querystring from 'querystring';
import child_process from 'child_process';
import thinkit from 'thinkit';
import co from 'co';
import base from './base';

/**
 * global think variable
 * @type {Object}
 */
global.think = Object.create(thinkit);
/**
 * server start time
 * @type {Number}
 */
think.startTime = Date.now();
/**
 * app dir name, can be set in init
 * @type {Object}
 */
think.dirname = {
  config: 'config',
  controller: 'controller',
  model: 'model',
  adapter: 'adapter',
  logic: 'logic',
  service: 'service',
  view: 'view',
  middleware: 'middleware',
  runtime: 'runtime',
  common: 'common',
  bootstrap: 'bootstrap',
  local: 'local'
};
/**
 * debug
 * @type {Boolean}
 */
think.debug = false;
/**
 * server port
 * @type {Number}
 */
think.port = 0;
/**
 * is command line
 * @type {String}
 */
think.cli = false;
//mini mode, no module
think.mode_mini = 0x0001;
//normal mode
think.mode_normal = 0x0002;
//module mode
think.mode_module = 0x0004;
/**
 * app mode
 * 0x0001: mini
 * 0x0002: normal
 * 0x0004: module
 * @type {Boolean}
 */
think.mode = 0x0001;
/**
 * thinkjs module lib path
 * @type {String}
 */
think.THINK_LIB_PATH = path.normalize(`${__dirname}/../`);
/**
 * thinkjs module root path
 * @type {String}
 */
think.THINK_PATH = path.dirname(think.THINK_LIB_PATH);
/**
 * thinkjs version
 * @param  {) []
 * @return {}         []
 */
think.version = (() => {
  let packageFile = `${think.THINK_PATH}/package.json`;
  let {version} = JSON.parse(fs.readFileSync(packageFile, 'utf-8'));
  return version;
})();
/**
 * module list
 * @type {Array}
 */
think.module = [];
/**
 * base class
 * @type {Class}
 */
think.base = base;
/**
 * get deferred object
 * @return {Object} []
 */
think.defer = () => {
  let deferred = {};
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });
  return deferred;
};

/**
 * check object is http object
 * @param  {Mixed}  obj []
 * @return {Boolean}      []
 */
think.isHttp = function(obj){
  return !!(obj && think.isObject(obj.req) && think.isObject(obj.res));
};

/**
 * alias co module to think.co
 * @type {Object}
 */
think.co = co;
/**
 * create class
 * @param {Object} methods [methods and props]
 */
let Class = think.Class;
think.Class = (type, clean) => {
  // create class
  // think.Class({})
  // think.Class({}, true)
  if (think.isObject(type)) {
    return clean === true ? Class(type) : Class(think.base, type);
  }
  // create class with superClass
  // think.Class(function(){}, {})
  else if (think.isFunction(type)) {
    return Class(type, clean);
  }

  //create type class
  return (superClass, methods) => {
    // think.controller();
    // think.controller({})
    if (think.isObject(superClass) || !superClass) {
      methods = superClass;
      superClass = type + '_base';
    }
    // think.controller('superClass', {})
    else if (think.isString(superClass)) {
      superClass = think.lookClass(superClass, type);
    }
    if (think.isString(superClass)) {
      superClass = think.require(superClass, true);
      // get class
      // think.controller('rest')
      if (!methods) {
        return superClass;
      }
    }
    return Class(superClass, methods);
  };
};
/**
 * look up class
 * @param  {String} type   [class type, model, controller, service]
 * @param  {String} module [module name]
 * @return {String}        []
 */
think.lookClass = (name, type, module) => {
  let names = name.split('/');
  switch(names.length){
    // home/controller/base
    case 3:
      return think.require(name);
    // home/base
    case 2:
      return think.require(`${names[0]}/${type}/${names[1]}`);
    // base
    case 1:
      let clsPath, cls;
      // find from current module
      if (module) {
        clsPath = `${module}/${type}/${name}`;
        cls = think.require(clsPath, true);
        if (cls) {
          return cls;
        }
      }
      // find from common module
      module = think.mode !== think.mode_module ? think.config('default_module') : think.dirname.common;
      let list = [
        `${module}/${type}/${name}`,
        `${type}_${name}`,
        `${type}_base`
      ];
      list.some(item => cls = think.require(item, true));
      return cls;
  }
};
/**
 * get common module path
 * think.getPath(undefined, think.dirname.controller)
 * think.getPath(home, think.dirname.model)
 * @return {String} []
 */
think.getPath = (module = think.dirname.common, type = think.dirname.controller) => {
  switch(think.mode){
    case think.mode_mini:
      return `${think.APP_PATH}/${type}`;
    case think.mode_normal:
      let filepath = `${think.APP_PATH}/${type}`;
      switch(type){
        case think.dirname.controller:
        case think.dirname.model:
        case think.dirname.logic:
        case think.dirname.service:
        case think.dirname.view:
          filepath += module;
          break;
      }
      return filepath;
    case think.mode_module:
      return `${think.APP_PATH}/${module}/${type}`;
  }
};

/**
 * require module
 * @param  {String} name []
 * @return {mixed}      []
 */
think.require = (name, flag) => {
  if (!think.isString(name)) {
    return name;
  }
  // adapter or middle by register
  if (think._aliasExport[name]) {
    return think._aliasExport[name];
  }

  let load = (name, filepath) => {
    let obj = think.safeRequire(filepath);
    if (think.isFunction(obj)) {
      obj.prototype.__filename = filepath;
    }
    think._aliasExport[name] = obj;
    return obj;
  };

  if (think._alias[name]) {
    return load(name, think._alias[name]);
  }
  // only check in alias
  if (flag) {
    return null;
  }
  let filepath = require.resolve(name);
  return load(filepath, filepath);
};
/**
 * safe require
 * @param  {String} file []
 * @return {mixed}      []
 */
think.safeRequire = file => {
  // absolute file path is not exist
  if (path.isAbsolute(file) && !think.isFile(file)) {
    return null;
  }
  try{
    return require(file);
  }catch(e){
    //if (think.debug) {
      console.error(e.stack);
    //}
  }
  return null;
};
/**
 * prevent next process
 * @return {Promise} []
 */
let preventMessage = 'PREVENT_NEXT_PROCESS';
think.prevent = () => {
  let err = new Error(preventMessage);
  return Promise.reject(err);
};
/**
 * check is prevent error
 * @param  {Error}  err [error message]
 * @return {Boolean}     []
 */
think.isPrevent = err => {
  return think.isError(err) && err.message === preventMessage;
};
/**
 * log
 * @TODO
 * @return {} []
 */
think.log = msg => {
  if (think.isError(msg)) {
    if(think.isPrevent(msg)){
      return;
    }
    console.log(msg.stack);
    return;
  }
  console.log(msg);
};

/**
 * think sys & common config
 * @type {Object}
 */
think._config = {};
/**
 * get or set config
 * @return {mixed} []
 */
think.config = (name, value, data = think._config) => {
  // get all config
  // think.config();
  if (name === undefined) {
    return data;
  }
  // merge config
  // think.config({name: 'welefen'})
  else if (think.isObject(name)) {
    think.extend(data, name);
  }
  // set or get config
  else if(think.isString(name)){
    name = name.toLowerCase();
    //one grade config
    if (name.indexOf('.') === -1) {
      if (value === undefined) {
        return data[name];
      }
      data[name] = value;
      return;
    }
    name = name.split('.');
    if (value === undefined) {
      value = data[name[0]] || {};
      return value[name[1]];
    }
    if (!(name[0] in data)) {
      data[name[0]] = {};
    }
    data[name[0]][name[1]] = value;
  }
};
/**
 * modules config
 * @type {Object}
 */
think._moduleConfig = {};
/**
 * get module config
 * @param  {String} module []
 * @return {Object}        []
 */
think.getModuleConfig = (module = think.dirname.common) => {
  if (!think.debug && module in think._moduleConfig) {
    return think._moduleConfig[module];
  }
  let rootPath;
  if (module === true) {
    rootPath = `${think.THINK_LIB_PATH}/config`;
  }else{
    rootPath = think.getPath(module, think.dirname.config);
  }
  //config.js
  let config = think.safeRequire(`${rootPath}/config.js`);
  let debugConfig = {}, cliConfig = {}, extraConfig = {};
  //debug.js
  if (think.debug) {
    debugConfig = think.safeRequire(`${rootPath}/debug.js`);
  }
  //load extra config by key
  if(think.isDir(rootPath) && module !== true){
    let filters = ['config', 'debug', 'cli'];
    fs.readdirSync(rootPath).forEach(item => {
      if(think.isDir(`${rootPath}/${item}`) || item[0] === '_'){
        return;
      }
      item = item.slice(0, -3);
      if(filters.indexOf(item) > -1){
        return;
      }
      let conf = think.safeRequire(`${rootPath}/${item}.js`);
      if(conf){
        extraConfig = think.extend(extraConfig, {[item]: conf});
      }
    })
  }
  //cli.js
  if(think.cli){
    cliConfig = think.safeRequire(`${rootPath}/cli.js`);
  }
  config = think.extend({}, config, debugConfig, extraConfig, cliConfig);
  //merge config
  if (module !== true) {
    config = think.extend({}, think._config, config);
  }
  //transform config
  let transforms = require(`${think.THINK_LIB_PATH}/config/transform.js`);
  config = think.transformConfig(config, transforms);
  think._moduleConfig[module] = config;
  return config;
};
/**
 * transform config
 * @param  {Object} config []
 * @return {Object}        []
 */
think.transformConfig = (config, transforms) => {
  for(let key in transforms){
    if (!(key in config)) {
      continue;
    }
    let value = transforms[key];
    if (think.isFunction(value)) {
      config[key] = value(config[key]);
    }else {
      config[key] = think.transformConfig(config[key], value);
    }
  }
  return config;
};
/**
 * hook list
 * @type {Object}
 */
think._hook = {};
/**
 * exec hook
 * @param  {String} name []
 * @return {}      []
 */
think.hook = function(name, http = {}, data) {
  //get hook data
  if (arguments.length === 1) {
    return think._hook[name] || [];
  }
  //set hook data
  else if (think.isArray(http)) {
    think._hook[name] = http;
    return;
  }

  //exec hook 
  let list = think._hook[name] || [];
  let length = list.length;
  if (length === 0) {
    return Promise.resolve(data);
  }
  http._middleware = data;

  //exec middleware
  let execMiddleware = async () => {
    for(let i = 0; i < length; i++){
      let data = await think.middleware(list[i], http, http._middleware);
      if (data !== undefined) {
        http._middleware = data;
      }
    }
    return http._middleware;
  };

  return execMiddleware();
};
/**
 * create or exec middleware
 * @param  {Function} superClass []
 * @param  {Object} methods      []
 * @return {mixed}            []
 */
let middleware = null;
think._middleware = {};
think.middleware = function(superClass, methods, data) {
  let length = arguments.length;
  let prefix = 'middleware_';
  // register functional middleware
  // think.middleware('parsePayLoad', function(){})
  if (think.isString(superClass) && think.isFunction(methods)) {
    think._middleware[superClass] = methods;
    return;
  }
  // exec middleware
  // think.middleware('parsePayLoad', http, data)
  if (length >= 2 && think.isHttp(methods)) {
    let name = superClass, http = methods;
    if (name in think._middleware) {
      let fn = think._middleware[name];
      return think.co.wrap(fn)(http, data);
    }else if (think.isString(name)) {
      let cls = think.require(prefix + name);
      let instance = new cls(http);
      return think.co.wrap(instance.run).bind(instance)(data);
    }else if (think.isFunction(name)){
      return think.co.wrap(name)(http, data);
    }else{
      throw new Error(think.message('MIDDLEWARE_NOT_FOUND', superClass));
    }
  }
  // get middleware
  // think.middleware('parsePayLoad')
  if (length === 1 && think.isString(superClass)) {
    let cls = think.require(prefix + superClass, true);
    if (cls) {
      return cls;
    }
    throw new Error(think.message('MIDDLEWARE_NOT_FOUND', superClass));
  }
  if (!middleware) {
    middleware = think.Class('middleware');
  }
  // create middleware
  return middleware(superClass, methods);
};

/**
 * create, register, call adapter
 * @param  {String} name []
 * @return {void}      []
 */
think.adapter = function(type, name, fn){
  //load sys adapter
  think.loadAdapter();

  let length = arguments.length, key = 'adapter_';
  //register adapter
  //think.adapter('session', 'redis', function(){})
  if (length === 3 && think.isFunction(fn)) {
    key += `${type}_${name}`;
    think._aliasExport[key] = fn;
    return;
  }
  //create adapter
  //module.exports = think.adapter('session', 'base', {})
  if (length === 3 && think.isObject(fn)) {
    return think.Class(think.adapter(type, name), fn);
  }
  //get adapter
  //think.adapter('session', 'redis')
  if (length === 2 && think.isString(name)) {
    key += type + '_' + name;
    let cls = think.require(key, true);
    if (cls) {
      return cls;
    }
    throw new Error(think.message('ADAPTER_NOT_FOUND', key));
  }
  //create adapter
  //module.exports = think.adapter({})
  //module.exports = think.adapter(function(){}, {});
  let superClass;
  if (think.isFunction(type)) {
    superClass = type;
  }else if (think.isString(type)) {
    superClass = think.require(type);
  }
  //create clean Class
  if (!superClass) {
    return think.Class(type, true);
  }
  return think.Class(superClass, name);
};
/**
 * load system & comon module adapter
 * @return {} []
 */
let adapterLoaded = false;
think.loadAdapter = force => {
  if (adapterLoaded && !force) {
    return;
  }
  adapterLoaded = true;
  let paths = [`${think.THINK_LIB_PATH}/adapter`];
  //common module adapter
  let adapterPath = think.getPath(undefined, think.dirname.adapter);
  if (think.isDir(adapterPath)) {
    paths.push(adapterPath);
  }
  paths.forEach(path => {
    let dirs = fs.readdirSync(path);
    dirs.forEach(dir => {
      think.alias(`adapter_${dir}`, `${path}/${dir}`);
      //adapter type base class
      let cls = think.require(`adapter_${dir}_base`, true);
      if(cls){
        think.adapter[dir] = cls;
      }
    });
  });
};

/**
 * module alias
 * @type {Object}
 */
think._alias = {};
/**
 * module alias export
 * @type {Object}
 */
think._aliasExport = {};
/**
 * load alias
 * @param  {String} type  []
 * @param  {Array} paths []
 * @return {Object}       []
 */
think.alias = (type, paths, slash) => {
  //regist alias
  if (!think.isArray(paths)) {
    paths = [paths];
  }
  paths.forEach(path => {
    let files = think.getFiles(path);
    files.forEach(file => {
      if(file.slice(-3) !== '.js' || file[0] === '_'){
        return;
      }
      let name = file.slice(0, -3);
      name = type + (slash ? '/' : '_') + name;
      think._alias[name] = `${path}/${file}`;
    });
  });
};
/**
 * route list
 * @type {Array}
 */
think._route = null;
/**
 * load route
 * @return {} []
 */
think.route = clear => {
  if (clear) {
    //clear route
    if (clear === true) {
      think._route = null;
    }
    //set route
    else if (think.isArray(clear)) {
      think._route = clear;
    }
    return;
  }
  if (think._route !== null) {
    return think._route;
  }
  let file = think.getPath(undefined, think.dirname.config) + '/route.js';
  let config = think.safeRequire(file);
  //route config is funciton
  //may be is dynamic save in db
  if (think.isFunction(config)) {
    let fn = think.co.wrap(config);
    return fn().then((route) => {
      think._route = route || [];
      return think._route;
    });
  }
  think._route = config || [];
  return think._route;
};
/**
 * thinkjs timer list
 * @type {Object}
 */
think.timer = {};
/**
 * regist gc
 * @param  {Object} instance [class instance]
 * @return {}          []
 */
think.gc = instance => {
  if (!instance || !instance.gcType) {
    throw new Error(think.message('GCTYPE_MUST_SET'));
  }
  let type = instance.gcType;
  if (think.debug || think.mode === 'cli' || type in think.timer) {
    return;
  }
  think.timer[type] = setInterval(() => {
    let hour = (new Date()).getHours();
    let hours = think._config.cache_gc_hour || [];
    if (hours.indexOf(hour) === -1) {
      return;
    }
    return instance.gc && instance.gc(Date.now());
  }, 3600 * 1000);
};
/**
 * local ip
 * @type {String}
 */
think.localIp = '127.0.0.1';
/**
 * get http object
 * @param  {Object} req [http request]
 * @param  {Object} res [http response]
 * @return {Object}     [http object]
 */
let http;
think._http = (data = {}) => {
  if (think.isString(data)) {
    if (data[0] === '{') {
      data = JSON.parse(data);
    }else if (/^[\w]+\=/.test(data)) {
      data = querystring.parse(data);
    }else{
      data = {url: data};
    }
  }
  let url = data.url || '';
  if (url.indexOf('/') !== 0) {
    url = '/' + url;
  }
  let req = {
    httpVersion: '1.1',
    method: (data.method || 'GET').toUpperCase(),
    url: url,
    headers: think.extend({
      host: data.host || think.localIp
    }, data.headers),
    connection: {
      remoteAddress: data.ip || think.localIp
    }
  };
  let empty = () => {};
  let res = {
    end: data.end || data.close || empty,
    write: data.write || data.send || empty,
    setHeader: empty
  };
  return {
    req: req,
    res: res
  };
};

think.http = (req, res) => {
  if (!http) {
    http = think.require('http');
  }
  //for cli request
  if (res === undefined) {
    let data = think._http(req);
    req = data.req;
    res = data.res;
  }
  return (new http(req, res)).run();
};
/**
 * get uuid
 * @param  {Number} length [uid length]
 * @return {String}        []
 */
think.uuid = (length = 32) => {
  // length = length || 32;
  let str = crypto.randomBytes(Math.ceil(length * 0.75)).toString('base64').slice(0, length);
  return str.replace(/[\+\/]/g, '_');
};
/**
 * start session
 * @param  {Object} http []
 * @return {}      []
 */
let Cookie;
think.session = http => {
  if (http.session) {
    return http.session;
  }
  if (!Cookie) {
    Cookie = think.require('cookie');
  }
  let sessionOptions = think.config('session');
  let name = sessionOptions.name;
  let sign = sessionOptions.sign;
  let cookie = http._cookie[name];
  //validate cookie sign
  if (cookie && sign) {
    cookie = Cookie.unsign(cookie, sign);
    //set unsigned cookie to http._cookie
    if (cookie) {
      http._cookie[name] = cookie;
    }
  }
  let sessionCookie = cookie;
  if (!cookie) {
    let options = sessionOptions.cookie || {};
    cookie = think.uuid(options.length || 32);
    sessionCookie = cookie;
    //sign cookie
    if (sign) {
      cookie = Cookie.sign(cookie, sign);
    }
    http._cookie[name] = sessionCookie;
    http.cookie(name, cookie, options);
  }
  let type = sessionOptions.type || 'base';
  if (type === 'base') {
    if (think.debug || think.config('cluster_on')) {
      type = 'file';
      think.log('in debug or cluster mode, session can\'t use memory for storage, convert to File');
    }
  }
  let session = think.adapter('session', type)({
    cookie: sessionCookie,
    timeout: sessionOptions.timeout
  });
  http.session = session;
  http.on('afterEnd', () => session.flush && session.flush());
  return session;
};
/**
 * get module name
 * @param  {String} module []
 * @return {String}        []
 */
think.getModule = module => {
  if (!module || think.mode === think.mode_mini) {
    return think.config('default_module');
  }
  return module.toLowerCase();
};

let nameReg = /^[A-Za-z\_]\w*$/;
think.getController = controller => {
  if (!controller) {
    return think.config('default_controller');
  }
  if (nameReg.test(controller)) {
    return controller.toLowerCase();
  }
  return '';
};
/**
 * get action
 * @param  {String} action [action name]
 * @return {String}        []
 */
think.getAction = action => {
  if (!action) {
    return think.config('default_action');
  }
  if (nameReg.test(action)) {
    return action;
  }
  return '';
};
/**
 * create controller sub class
 * @type {Function}
 */
let controller = null;
think.controller = (superClass, methods, module) => {
  let isConfig = think.isHttp(methods) || module;
  // get controller instance
  if (think.isString(superClass) && isConfig) {
    let cls = think._controller(superClass, 'controller', module);
    return cls(methods);
  }
  if(!controller){
    controller = think.Class('controller');
  }
  //create sub controller class
  return controller(superClass, methods);
};
/**
 * create logic class
 * @type {Function}
 */
let logic = null;
think.logic = (superClass, methods, module) => {
  let isConfig = think.isHttp(methods) || module;
  //get logic instance
  if (think.isString(superClass) && isConfig) {
    let cls = think.lookClass(superClass, 'logic', module);
    return cls(methods);
  }
  if(!logic){
    logic = think.Class('logic');
  }
  //create sub logic class
  return logic(superClass, methods);
};
/**
 * create model sub class
 * @type {Function}
 */
let model = null;
think.model = (superClass, methods, module) => {
  let isConfig = methods === true || module;
  if (!isConfig && methods) {
    //db configs
    if ('host' in methods && 'type' in methods && 'port' in methods) {
      isConfig = true;
    }
  }
  //get model instance
  if (think.isString(superClass) && isConfig) {
    methods = think.extend({}, think.config('db'), methods);
    let cls = think.lookClass(superClass, 'model', module);
    return new cls(superClass, methods);
  }
  if(!model){
    model = think.Class('model');
  }
  //create model
  return model(superClass, methods);
};
//model relation type
think.model.HAS_ONE = 1;
think.model.BELONG_TO = 2;
think.model.HAS_MANY = 3;
think.model.MANY_TO_MANY = 4;

/**
 * create service sub class
 * @type {Function}
 */
let service = null;
think.service = (superClass, methods, module) => {
  let isConfig = think.isHttp(methods) || methods === true || module;
  //get service instance
  if (think.isString(superClass) && isConfig) {
    let cls = think.lookClass(superClass, 'service', module);
    if (think.isFunction(cls)) {
      return new cls(methods);
    }
    return cls;
  }
  if(!service){
    service = think.Class('service');
  }
  //create sub service class
  return service(superClass, methods);
};
/**
 * get error message
 * @param  {String} type [error type]
 * @param  {Array} data []
 * @return {}      []
 */
think._message = {};
think.message = (type, ...data) => {
  let msg = think._message[type];
  if (!msg) {
    return;
  }
  data.unshift(msg);
  return util.format(...data);
};
/**
 * get or set cache
 * @param  {String} type  [cache type]
 * @param  {String} name  [cache name]
 * @param  {Mixed} value [cache value]
 * @return {}       []
 */
think.cache = async (name, value, options = {}) => {
  let cls = think.adapter('cache', options.type || 'base');
  let instance = new cls(options);
  if(value === undefined){
    return instance.get(name);
  } else if(value === null){
    return instance.rm(name);
  } else if(think.isFunction(value)){
    let data = await instance.get(name);
    if(data !== undefined){
      return data;
    }
    data = await think.co.wrap(value)(name);
    await instance.set(name, data);
    return data;
  }
  return instance.set(name, value);
};
/**
 * valid data
 * [{
 *   name: 'xxx',
 *   type: 'xxx',
 *   value: 'xxx',
 *   required: true,
 *   default: 'xxx',
 *   args: []
 *   msg: ''
 * }, ...]
 * @param  {String | Object}   name     []
 * @param  {Function} callback []
 * @return {}            []
 */
let valid = null;
think.valid = (name, callback) => {
  if (!valid) {
    valid = think.require('valid');
  }
  if (think.isString(name)) {
    // register valid callback
    // think.valid('test', function(){})
    if (think.isFunction(callback)) {
      valid[name] = callback;
      return;
    }
    // get valid callback
    return valid[name];
  }
  // convert object to array
  if (think.isObject(name)) {
    let d = [];
    for(let key in name){
      let value = name[key];
      value.name = key;
      d.push(value);
    }
    name = d;
  }
  let data = {}, msg = {};
  name.forEach(item => {
    // value required
    if (item.required) {
      if (!item.value) {
        msg[item.name] = think.message('PARAMS_EMPTY', item.name);
        return;
      }
    }else{
      if (!item.value) {
        //set default value
        if (item.default) {
          data[item.name] = item.default;
        }
        return;
      }
    }
    data[item.name] = item.value;
    if (!item.type) {
      return;
    }
    let type = valid[item.type];
    if (!think.isFunction(type)) {
      throw new Error(think.message('CONFIG_NOT_FUNCTION', item.type));
    }
    if (!think.isArray(item.args)) {
      item.args = [item.args];
    }
    item.args = item.args.unshift(item.value);
    let result = type.apply(valid, item.args);
    if (!result) {
      let itemMsg = item.msg || think.message('PARAMS_NOT_VALID');
      msg[item.name] = itemMsg.replace('{name}', item.name).replace('{valud}', item.value);
    }
  });
  return {msg, data};
};

/**
 * install node package
 * @param  {String} pkg [package name]
 * @return {Promise}     []
 */
think.npm = (pkg) => {
  try{
    return Promise.resolve(require(pkg));
  } catch(e){
    let pkgWithVersion = pkg;
    //get package version
    if(pkgWithVersion.indexOf('@') === -1){
      let version = think.config('package')[pkg];
      if(version){
        pkgWithVersion += '@' + version;
      }
    }
    let cmd = `npm install ${pkgWithVersion}`;
    let deferred = think.defer();
    console.log(`install ${pkgWithVersion} start`);
    child_process.exec(cmd, {
      cwd: think.THINK_PATH
    }, (err, stdout, stderr) => {
      if(err || stderr){
        console.log(`install ${pkgWithVersion} error`);
        deferred.reject(err || stderr);
      }else{
        console.log(`install ${pkgWithVersion} finish`);
        deferred.resolve(require(pkg));
      }
    });
    return deferred.promise;
  }
};
/**
 * locals
 * @param  {String} key []
 * @return {}     []
 */
think._ = key => {
  return key;
}

/**
 * global cache
 * @type {Object}
 */
global.thinkCache = (type, name, value) => {
  type = '_' + type;
  if (!(type in thinkCache)) {
    thinkCache[type] = {};
  }
  // get cache
  if (name === undefined) {
    return thinkCache[type];
  }
  // get cache
  else if (value === undefined) {
    if (think.isString(name)) {
      return thinkCache[type][name];
    }
    thinkCache[type] = name;
    return;
  }
  //remove cache
  else if (value === null) {
    delete thinkCache[type][name];
    return;
  }
  //set cache
  thinkCache[type][name] = value;
};
//cache key
thinkCache.BASE = 'base';
thinkCache.TEMPLATE = 'template';
thinkCache.VIEW = 'view';
thinkCache.DB = 'db';
thinkCache.TABLE = 'table';
thinkCache.SESSION = 'session';
thinkCache.REDIS = 'redis';
thinkCache.MEMCACHE = 'memcache';
thinkCache.FILE = 'file';