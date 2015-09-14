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
goog.provide('safelight.Builder');

goog.require('safelight.NaclSniffer');



/**
 * Builder is a service that manages requests to build a Safelight package.
 * It assumes that there is an HTTP server that will respond
 * to HTTP POST to /build, with params of:
 *
 *   target: the Halide target to build
 *   functionName: the function name for the filter
 *   pathToGen: the path to a _generator.cpp file.  This path may be absolute
 *              or relative to the halide directory.
 *
 * If the POST succeeds, it will respond with a SHA256 string unique
 * to the resulting build (this can later be used to retrieve the built
 * executable). If it fails, it will respond with an error string.
 *
 * While a build is underway, this service may also perform HTTP GET to
 * /buildlog, which is expected to return the cumulative build log results
 * (which may be displayed to the user).
 *
 * @param {!safelight.NaclSniffer} naclSniffer
 * @param {!Object} $cookies
 * @param {!angular.$http} $http
 * @param {!angular.$interval} $interval
 * @param {!angular.$q} $q
 * @struct @ngInject @constructor
 */
safelight.Builder = function(naclSniffer, $cookies, $http, $interval, $q) {
  /** @private @const {number} */
  this.POLL_INTERVAL_MS_ = 1000;

  /** @private @const {!safelight.NaclSniffer} */
  this.naclSniffer_ = naclSniffer;

  /** @private @const {!Object} */
  this.$cookies_ = $cookies;

  /** @private @const {!angular.$http} */
  this.$http_ = $http;

  /** @private @const {!angular.$interval} */
  this.$interval_ = $interval;

  /** @private @type {!angular.$q} */
  this.$q_ = $q;

  /** @private {angular.$q.Promise} */
  this.buildLogUpdater_ = null;

  /** @export {string} */
  this.functionName = 'brighten';

  /** @export {string} */
  this.activeTargetName = 'Chrome (x86-64-nacl-sse41)';

  /** @export {!Array<string>} */
  this.buildTargetNames = [];

  /** @private {!Object<string, ?Object>} */
  this.buildTargets_ = {};

  /** @export {string} */
  this.pathToGen = 'generator/brighten_generator.cpp';

  /** @export {!Array<string>} */
  this.pathToGenHistory = [
    'generator/brighten_generator.cpp'
  ];


  /** @private {!Array<function(?Object)>} */
  this.buildCompleteListeners_ = [];

  this.loadSettings_();

  // Fire off both in parallel, then use $q.all() to wait for both
  // to be finished
  var naclDevices = this.naclSniffer_.getHalideTargets().then(
    function(targets) {
      for (var i in targets) {
        var target = targets[i];
        var device = 'chrome';
        var name = 'Chrome (' + target + ')';
        this.buildTargets_[name] = {
          'name': name,
          'target': target,
          'device': device
        };
      }
    }.bind(this)
  );

  $q.all([naclDevices]).then(
    function() {
      // this.activeTargetName has already been loaded from cookies;
      // validate it and change if no longer valid
      if (!this.buildTargets_.hasOwnProperty(this.activeTargetName)) {
        for (var name in this.buildTargets_) {
          this.activeTargetName = name;
          break;
        }
      }
      this.buildTargetNames = [];
      for (var name in this.buildTargets_) {
        this.buildTargetNames.push(name);
      }
      this.buildTargetNames.sort();
    }.bind(this)
  );
};


/**
 * addBuildListener() adds a callback listener that is called whenever
 * a build() completes. The listener will receive the an object containing the
 * signature, target, and device of the build upon success, or null upon
 * failure.
 *
 * @param {!function(?Object)} listener The listener.
 * @return {function():boolean} A function which, when called, removes the
 *     listener.
 */
safelight.Builder.prototype.addBuildListener = function(listener) {
  var pos = this.buildCompleteListeners_.indexOf(listener);
  if (pos < 0) {
    this.buildCompleteListeners_.push(listener);
  }
  return function() {
    /** @type {number} */
    var pos = this.buildCompleteListeners_.indexOf(listener);
    if (pos >= 0) {
      this.buildCompleteListeners_.splice(pos, 1);
      return true;
    }
    return false;
  }.bind(this);
};


/**
 * onBuild_() calls any build listeners that are registered.
 *
 * @param {?Object} buildInfo The build info (or null)
 * @private
 */
safelight.Builder.prototype.onBuild_ = function(buildInfo) {
  this.buildCompleteListeners_.forEach(function(f) { f(buildInfo); });
};


/**
 * build() requests that the Safelight module for the function name, generator path
 * and target be built. It returns a promise that provides the SHA256 signature
 * of the module (on success), error message (on failure), and build log
 * (on notify).
 *
 * @return {!angular.$q.Promise} promise Angular promise object.
 */
safelight.Builder.prototype.build = function() {
  var $http = this.$http_;
  var $interval = this.$interval_;
  var $q = this.$q_;

  if (!this.pathToGen) {
    return $q.reject('You must specify a path to your generator.cpp file');
  }
  this.updateBuildLabelHistory_();
  this.saveSettings_();

  var deferred = $q.defer();

  /** {angular.$q.Promise} */
  var buildLogUpdater = $interval(function() {
    $http.get('/buildlog').then(
      function(response) {
        var data = response['data'];
        deferred.notify(data);
      }
    );
  }, this.POLL_INTERVAL_MS_);

  var buildTarget = this.buildTargets_[this.activeTargetName];
  if (!buildTarget) {
    return $q.reject('Invalid build target ' + this.activeTargetName);
  }

  var target = buildTarget['target'];
  var device = buildTarget['device'];

  /** @const */ var config = {
    'params': {
      'target' : target,
      'functionName' : this.functionName,
      'pathToGen' : this.pathToGen
    }
  };
  $http.post('/build', '', config).then(
    // success
    function(response) {
      var signature = response['data'];
      $interval.cancel(buildLogUpdater);
      // Update the build log one last time
      $http.get('/buildlog').then(
        // success
        function(response) {
          var data = response['data'];
          deferred.notify(data);
        }.bind(this)
      ).finally(
        function() {
          var buildInfo = {
            'signature': signature,
            'target': target,
            'device': device
          };
          this.onBuild_(buildInfo);
          deferred.resolve(buildInfo);
        }.bind(this));
    }.bind(this),
    // failure
    function(response) {
      var failure = response['data'];
      $interval.cancel(buildLogUpdater);
      var errors = safelight.Builder.summarizeErrors_(String(failure));
      // Update the build log one last time
      $http.get('/buildlog').then(
        // success
        function(response) {
          var data = response['data'];
          deferred.notify(data);
        }.bind(this)
      ).finally(
        function() {
          this.onBuild_(null);
          deferred.reject(errors);
        }.bind(this)
      );
    }.bind(this)
  );

  return deferred.promise;
};


/**
 * Save interesting settings to cookies.
 * @private
 */
safelight.Builder.prototype.saveSettings_ = function() {
  var $cookies = this.$cookies_;
  $cookies.functionName = this.functionName;
  $cookies.pathToGen = this.pathToGen;
  $cookies.activeTargetName = this.activeTargetName;
  $cookies.pathToGenHistory = this.pathToGenHistory;
};


/**
 * Load interesting settings to cookies, overwriting any existing
 * values for those settings.
 * @private
 */
safelight.Builder.prototype.loadSettings_ = function() {
  var $cookies = this.$cookies_;
  if ($cookies.functionName) {
    this.functionName = $cookies.functionName;
  }
  if ($cookies.pathToGen) {
    this.pathToGen = $cookies.pathToGen;
  }
  if ($cookies.activeTargetName) {
    this.activeTargetName = $cookies.activeTargetName;
  }
  if ($cookies.pathToGenHistory) {
    this.pathToGenHistory = [];
    var history = $cookies.pathToGenHistory.split(',');
    for (var i = 0; i < history.length; i++) {
      this.pathToGenHistory.push(history[i]);
    }
  }
};


/**
 * summarizeErrors_() processes raw error messages from the build
 * server and massages them into a form that is more concisely
 * suitable for displaying in an alert to the user.
 *
 * @param {string} errors The raw error message from the server.
 * @return {string}
 * @private
 */
safelight.Builder.summarizeErrors_ = function(errors) {
  /** @const */ var MESSAGE_HEADER =
      'Build failed; check below for the details.\n';
  var message = MESSAGE_HEADER;
  var lines = errors.split('\n');
  // We want to insert triple dots for skipped lines.
  // For that we are keeping track of line that had last message we
  // included into the output.
  var lastMessageIndex = -1;
  for (var i = 0; i < lines.length; i++) {
    // Lines that start with 'ERROR:' or with 'Fnnnn ' (where nnnn is some
    // error number) seem to be the most informative.
    if (lines[i].indexOf('ERROR:') == 0 ||
        lines[i].match(/^F\d\d\d\d /)) {
      if (lastMessageIndex < i - 1) {
        message += '...\n';
      }
      message += lines[i] + '\n';
      lastMessageIndex = i;
    }
  }
  // Add triple dots if we haven't included last message into the output.
  if (lastMessageIndex < lines.length - 1) {
    message += '...\n';
  }
  return message;
};


/**
 * updateBuildLabelHistory_() adds the current build label to the history,
 * dropping the oldest label if necessary.
 * @private
 */
safelight.Builder.prototype.updateBuildLabelHistory_ = function() {
  var existingEntry = this.pathToGenHistory.indexOf(this.pathToGen);
  if (existingEntry != -1) {
    // Remove element to put it to the top.
    this.pathToGenHistory.splice(existingEntry, 1);
  }
  this.pathToGenHistory.unshift(this.pathToGen);
  /** @const */ var kMaxHistoryEntries = 10; // Seems to be a good number.
  if (this.pathToGenHistory.length > kMaxHistoryEntries) {
    this.pathToGenHistory.pop();
  }
};


/**
 * getAssembly() retrieves the assembly source for the currently-built
 * filter.
 * @param {string} signature The build signature.
 * @param {string} target The build target.
 * @return {!angular.$q.Promise} promise Angular promise object.
 */
safelight.Builder.prototype.getAssembly = function(signature, target) {
  var $http = this.$http_;
  var $q = this.$q_;
  var deferred = $q.defer();
  var url = '/safelight_' + signature + '_' + target + '.s';
  $http.get(url).then(
    // success
    function(response) {
      var data = response['data'];
      deferred.resolve(data);
    },
    // failure
    function(response) {
      var data = response['data'];
      deferred.reject('Unable to get assembly: ' + data);
    }
  );
  return deferred.promise;
};


/**
 * getStmtHtmlURL() returns an URL to the .stmt source (in HTML-wrapped form)
 * for the currently-built filter.
 *
 * @param {string} signature The build signature.
 * @param {string} target The build target.
 * @return {string} url URL to the .stmt source
 */
safelight.Builder.prototype.getStmtHtmlURL = function(signature, target) {
  var url = '/safelight_' + signature + '_' + target + '.html';
  return url;
}
