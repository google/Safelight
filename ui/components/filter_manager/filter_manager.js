/*
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';
goog.provide('safelight.FilterManager');
goog.provide('safelight.filterManager.module');

goog.require('safelight.Argument');
goog.require('safelight.Buffer');
goog.require('safelight.DefaultInputValues');
goog.require('safelight.NexeModule');
goog.require('safelight.NexeModuleLoader');
goog.require('safelight.defaultInputValues.module');
goog.require('safelight.nexeModuleLoader.module');



/**
 * FilterManager is a service used to load and run a Filter (aka an AOT-
 * compiled Generator). A single Filter can be active at any time.
 *
 * @param {!angular.$q} $q
 * @param {!angular.$http} $http
 * @param {!safelight.DefaultInputValues} defaultInputValues
 * @param {!safelight.NexeModuleLoader} nexeModuleLoader
 * @struct @ngInject @constructor
 */
safelight.FilterManager = function($q,
                                   $http,
                                   defaultInputValues,
                                   nexeModuleLoader) {
  /** @private {!angular.$q} */
  this.$q_ = $q;

  /** @private @const {!angular.$http} */
  this.$http_ = $http;

  /** @private {!safelight.DefaultInputValues} */
  this.defaultInputValues_ = defaultInputValues;

  /** @private {!safelight.NexeModuleLoader} */
  this.nexeModuleLoader_ = nexeModuleLoader;

  /** @private {?safelight.NexeModule} */
  this.activeNexeFilter_ = null;

  /** @private {string} */
  this.activeDevice_ = '';

  /** @private {number} */
  this.defaultBufferSideLength_ = 64;

  /** @private {!Array<!safelight.Argument>} */
  this.arguments_ = [];

  /** @private {!Object<string, ?Object|boolean|number|string>} */
  this.values_ = {};

  /** @private {!Array<function(!Array<!safelight.Argument>,
   *            !Object<string, ?Object|boolean|number|string>)>} */
  this.activeFilterChangedListeners_ = [];

  /** @private {!Array<function(
   *            !Object<string, ?Object|boolean|number|string>)>} */
  this.valuesChangedListeners_ = [];
};


/**
 * loadFilter() loads the Filter  with the given buildInfo and makes it
 * ready to run. A Promise will be returned when ready (or if loading fails).
 * The filter is presumed to have been recently built by the safelight.Builder
 * service.
 *
 * In addition to loading the NaCl executable, this will call the filter's
 * 'describe' functionality and populate a list of the input/output
 * Arguments required by the filter, and also populate a map of Values
 * that are acceptable defaults.
 *
 * This method can be called publicly, but more commonly will simply be
 * added to the safelight.Builder service as a listener, to automatically
 * load filters that are built.
 *
 * @param {?Object} buildInfo signature/target/device of the filter.
 * @return {!angular.$q.Promise} promise Angular promise object.
 */
safelight.FilterManager.prototype.loadFilter = function(buildInfo) {
  var $q = this.$q_;

  if (!buildInfo) {
    return $q.reject('Invalid buildInfo.');
  }

  var signature = buildInfo['signature'];
  var target = buildInfo['target'];
  var device = buildInfo['device'];

  /** @type {!angular.$q.Deferred} */
  var deferred = $q.defer();

  // Don't call unload(): we want to preserve the old values for now.
  // (We'll call unload() in the event of complete failure.)
  if (this.activeNexeFilter_) {
    this.activeNexeFilter_.unload();
  }
  this.activeNexeFilter_ = null;
  this.activeDevice_ = '';

  var promise;
  if (device == 'chrome') {
    // If device is 'chrome' then it's a NaCl .nexe module; we should
    // attempt to load it directly and then ask for a description.
    this.activeNexeFilter_ = this.nexeModuleLoader_.load(
        '/safelight_' + signature + '_' + target + '.nmf');
    promise = this.activeNexeFilter_.request('describe', {});
  } else {
    this.activeDevice_ = device;
    /** @const */ var config = {
      'params': {
        'device' : device,
        'signature' : signature,
        'target' : target,
      }
    };
    promise = this.$http_.post('/deploy', '', config).then(
      function(response) { return $q.when(response['data']); },
      function(response) { return $q.reject(response['data']); }
    );
  }
  promise.then(
    function(success) {
      var d;
      try {
        d = success['success']['description'];
        if (typeof(d) == 'string') {
          d = JSON.parse(d);
        }
      } catch (e) {
        d = null;
      }
      if (d) {
        this.processDescription_(/** @type {!Object} */(d));
        deferred.resolve(signature);
      } else {
        this.unload();
        deferred.reject('Description parse failed');
      }
    }.bind(this),
    function(failure) {
      this.unload();
      deferred.reject(failure['failure']);
    }.bind(this)
  );
  return deferred.promise;
};


/**
 * unload() will unload the active filter (if any). All calls to FilterManager
 * will fail until another (successful) call to loadFilter completes.
 */
safelight.FilterManager.prototype.unload = function() {
  if (this.activeNexeFilter_) {
    this.activeNexeFilter_.unload();
  }
  this.activeNexeFilter_ = null;
  this.activeDevice_ = '';
  this.arguments_ = [];
  this.values_ = {};
  this.onActiveFilterChanged_();
  this.onValuesChanged(this.values_);
};


/**
 * addActiveFilterChangedListener() adds a callback listener that is called
 * whenever the active filter changes; the listener is provided with a list
 * of Arguments. (If the Arguments list is empty, there
 * is no active filter.)
 *
 * The list of Arguments should be considered read-only
 * (mutating the list or the list contents will cause unpredictable failures).
 *
 * Each call to a listener indicates that previous Arguments
 * collection should be considered invalid and no longer connected to
 * the FilterManager in any way.
 *
 * @param {!function(!Array<!safelight.Argument>)} listener The listener.
 * @return {function():boolean} A function which, when called, removes the
 *    listener.
 */
safelight.FilterManager.prototype.addActiveFilterChangedListener =
    function(listener) {
  /** @type {number} */
  var pos = this.activeFilterChangedListeners_.indexOf(listener);
  if (pos < 0) {
    this.activeFilterChangedListeners_.push(listener);
  }
  return function() {
    /** @type {number} */
    var pos = this.activeFilterChangedListeners_.indexOf(listener);
    if (pos >= 0) {
      this.activeFilterChangedListeners_.splice(pos, 1);
      return true;
    }
    return false;
  }.bind(this);
};


/**
 * onActiveFilterChanged_() calls any filter-changed listeners that are active.
 * @private
 */
safelight.FilterManager.prototype.onActiveFilterChanged_ = function() {
  this.activeFilterChangedListeners_.forEach(function(f) {
    f(this.arguments_);
  }.bind(this));
};


/**
 * addValuesChangedListener() adds a callback listener that is called
 * whenever the values for the active filter change; the listener is provided
 * with a map of Values. (If the Values map is empty, there
 * is no active filter.)
 *
 * The map of Values should be considered read-only; onValuesChanged() should be
 * called to notify the FilterManager of changed. (Note that only input
 * Values should be mutated.)
 *
 * The stdout/stderr log (if any) of the filter will be present in the Values
 * under the key '$log' (since Generator arguments cannot legally begin with
 * the '$' character, this will never overlap an argument name). Similarly,
 * the filter execution time (microseconds) will be in '$time_usec'.
 *
 * @param {!function(
 *         !Object<string, ?Object|boolean|number|string>)} listener The
 * listener.
 * @return {function():boolean} A function which, when called, removes the
 *    listener.
 */
safelight.FilterManager.prototype.addValuesChangedListener = function(
    listener) {
  /** @type {number} */
  var pos = this.valuesChangedListeners_.indexOf(listener);
  if (pos < 0) {
    this.valuesChangedListeners_.push(listener);
  }
  return function() {
    /** @type {number} */
    var pos = this.valuesChangedListeners_.indexOf(listener);
    if (pos >= 0) {
      this.valuesChangedListeners_.splice(pos, 1);
      return true;
    }
    return false;
  }.bind(this);
};


/**
 * onValuesChanged() calls any value-changed listeners that are active.
 * Note that only the values that have been changed are populated in the map.
 *
 * @param {!Object<string, ?Object|boolean|number|string>} changed
 */
safelight.FilterManager.prototype.onValuesChanged = function(changed) {
  for (var name in changed) {
    // Use hasOwnProperty() since the new value might be null.
    if (this.values_.hasOwnProperty(name)) {
      this.values_[name] = changed[name];
    }
  }
  this.valuesChangedListeners_.forEach(function(f) {
    f(changed);
  }.bind(this));
};


/**
 * shouldPreserveValue() is used to determine if we should attempt to preserve
 * a given parameter value when loading a new (or changed) Filter; if the
 * name and type of the parameter's Argument are unchanged, we attempt to
 * preserve it.
 *
 * @param {!safelight.Argument} oldArg
 * @param {!safelight.Argument} newArg
 * @return {boolean}
 */
safelight.FilterManager.shouldPreserveValue = function(oldArg, newArg) {
  return oldArg.name == newArg.name &&
         oldArg.kind == newArg.kind &&
         oldArg.type_code == newArg.type_code &&
         oldArg.type_bits == newArg.type_bits &&
         oldArg.dimensions == newArg.dimensions;
};


/**
 * processDescription_() takes the JSON description of the Filter's
 * expected inputs and outputs, and assembles a list of Arguments; it also
 * ensures that the map of Values is valid:
 * -- for any parameters that have a named Value that appears to be
 * consistent with the new Argument of the same name, the Value is retained.
 * -- otherwise, a safe default Value is created for that parameter.
 *
 * @param {!Object} description dict-based description result. This function
 *     assumes only that this argument contains a member named 'argument' with
 *     a value that is an array of Objects that can be processed by
 *     Argument.fromDict.
 * @private
 */
safelight.FilterManager.prototype.processDescription_ = function(description) {
  /** @type {!Array<!safelight.Argument>} */
  var newArguments = [];
  var args = description['arguments'];
  for (var i = 0; i < args.length; ++i) {
    var a = safelight.Argument.fromDict(args[i]);
    if (a.type_code == 'handle') continue;
    newArguments.push(a);
  }
  /** @type {!Object<string, ?Object|boolean|number|string>} */
  var newValues = {};
  newValues['$log'] = '';
  newValues['$time_usec'] = 0;
  newValues['$pixels_processed'] = 0;
  for (var i = 0; i < newArguments.length; ++i) {
    /** @type {!safelight.Argument} */
    var a = newArguments[i];
    if (!a.isInput()) {
      // Outputs are set to null.
      newValues[a.name] = null;
      continue;
    }
    if (this.arguments_.length == newArguments.length &&
        safelight.FilterManager.shouldPreserveValue(this.arguments_[i], a) &&
        this.values_.hasOwnProperty(a.name)) {
      newValues[a.name] = this.values_[a.name];
      continue;
    }
    if (a.isBuffer()) {
      newValues[a.name] = this.defaultInputValues_.makeInputBuffer(
          a, this.defaultBufferSideLength_, this.defaultBufferSideLength_, i);
      continue;
    }
    if (a.type_code == safelight.ArgumentTypeCode.UINT && a.type_bits == 1) {
      // Force to boolean. (note that !!undefined -> false)
      newValues[a.name] = !!a.def;
      continue;
    }
    // All numbers are the same as far as JS is concerned
    /** @type {number} */
    var v = (a.def !== undefined) ? Number(a.def) : 0;
    if (a.min !== undefined) {
      v = Math.max(v, a.min);
    }
    if (a.max !== undefined) {
      v = Math.min(v, a.max);
    }
    newValues[a.name] = v;
  }
  this.arguments_ = newArguments;
  this.values_ = newValues;
  this.onActiveFilterChanged_();
  this.onValuesChanged(this.values_);
};

/**
 * buildInputsMap_() constructs the inputs map suitable for making
 * a packaged call.
 * @private
 * @param {boolean} useBase64 if true, convert buffer host fields to
 *     base64-encoded strings; if false, leave as ArrayBuffers.
 * @return {!Object} the input map
 */
safelight.FilterManager.prototype.buildInputsMap_ = function(useBase64) {
  var inputs = {};
  for (var i = 0; i < this.arguments_.length; ++i) {
    var a = this.arguments_[i];
    if (!a.isInput()) {
      continue;
    }
    var v = this.values_[a.name];
    if (a.isBuffer() && useBase64) {
      v = v.toBase64();
    }
    inputs[a.name] = v;
  }
  return inputs;
};


/**
 * run() will run the active filter using the current set of Values. Return a
 * Promise that will resolve successfully upon completion. The results of the
 * call will be updated in-place in the Values map (i.e., the entries that
 * have Argument.isInput() == false will be replaced).
 *
 * If there is no active filter, or if the Values have been mutated into
 * invalid values, the Promise will fail.
 *
 * @param {number} numThreads number of threads to use when running the filter.
 * @return {!angular.$q.Promise} promise Angular promise object.
 */
safelight.FilterManager.prototype.run = function(numThreads) {
  var $q = this.$q_;

  if (this.arguments_.length == 0) {
    return $q.reject('There is no filter ready to run');
  }

  /** @type {!angular.$q.Deferred} */
  var deferred = $q.defer();

  /** @type {function(!Object):!safelight.Buffer} */
  var bufferFromDict;

  /** @type {!angular.$q.Promise} */
  var promise;
  if (this.activeNexeFilter_) {
    bufferFromDict = safelight.Buffer.fromDict;
    promise = this.activeNexeFilter_.request('call', {
      'num_threads': numThreads,
      'inputs': this.buildInputsMap_(false)
    });
  } else if (this.activeDevice_) {
    bufferFromDict = safelight.Buffer.fromBase64Dict;
    /** @const */ var config = {
      'params': {
        'device' : this.activeDevice_,
        'num_threads': numThreads
      }
    };
    /** @const */ var inputs = {
      'inputs': this.buildInputsMap_(true)
    };
    promise = this.$http_.post('/run', inputs, config).then(
      function(response) { return $q.when(response['data']); },
      function(response) { return $q.reject(response['data']); }
    );
  } else {
    return $q.reject('There is no filter ready to run');
  }
  promise.then(
    function(success) {
      var changedValues = {};
      var pixelsProcessed = 0;
      var outputs = success['success']['outputs'];
      if (!outputs) {
        deferred.reject('Malformed result');
        return;
      }
      for (var name in outputs) {
        if (!this.values_.hasOwnProperty(name)) {
          deferred.reject('Saw unknown output: ' + name);
          return;
        }
        /** @type {!safelight.Buffer} */
        var b = bufferFromDict(outputs[name]);
        changedValues[name] = b;
        var pixels = Math.max(1, b.extent[0]) * Math.max(1, b.extent[1]);
        pixelsProcessed += pixels;
      }
      changedValues['$log'] = success['log'] || '';
      changedValues['$time_usec'] = success['success']['time_usec'] || 0;
      changedValues['$pixels_processed'] = pixelsProcessed;
      this.onValuesChanged(changedValues);
      deferred.resolve(this.values_);
    }.bind(this),
    function(failure) {
      var changedValues = {};
      // Use the failure message as the 'log' output
      changedValues['$log'] = failure['failure'] || '';
      changedValues['$time_usec'] = 0;
      changedValues['$pixels_processed'] = 0;
      for (var i = 0; i < this.arguments_.length; ++i) {
        var a = this.arguments_[i];
        if (!a.isInput()) {
          changedValues[a.name] = null;
        }
      }
      this.onValuesChanged(changedValues);
      deferred.reject(failure['failure']);
    }.bind(this)
  );

  return deferred.promise;
};


/**
 * setDefaultBufferSideLength() will side length used to construct default
 * values for buffer arguments. Most clients will never need to call this,
 * but it can be useful for testing.
 *
 * @param {number} len number of threads to use when running the filter.
 */
safelight.FilterManager.prototype.setDefaultBufferSideLength = function(len) {
  this.defaultBufferSideLength_ = Math.max(1, len);
};


/** @const {!angular.Module} */
safelight.filterManager.module =
    angular.module('safelight.filterManager.module', [
      safelight.defaultInputValues.module.name,
      safelight.nexeModuleLoader.module.name
    ])
    .service('filterManager', safelight.FilterManager);
