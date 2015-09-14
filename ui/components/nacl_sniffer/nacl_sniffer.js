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
goog.provide('safelight.NaclSniffer');
goog.provide('safelight.naclSniffer.module');

goog.require('safelight.NexeModule');
goog.require('safelight.NexeModuleLoader');
goog.require('safelight.alerter.module');
goog.require('safelight.nexeModuleLoader.module');


/**
 * NaclSniffer is a service that detects the native NaCl architecture
 * supported by the current browser; it does this in conjunction with
 * a custom NaCL module that does the detection. The module is expected
 * to be hosted under the path "/nacl_sniffer.nmf"; it's understands a single
 * Pepper message, of the form
 *
 *   { verb: 'sniff_architecture' }
 *
 * to which it will respond
 *
 *   { verb: 'sniff_architecture_response',
 *     success: { architecture: 'x86-64|x86-32|arm|unknown' } }
 *
 * NaclSniffer has a single public method, 'getArchitecture()';
 * it returns a Promise which will provide one of the valid architectures
 * above (for success), or '#error' (for failure).
 *
 * @struct @ngInject @constructor
 * @param {!angular.$q} $q
 * @param {!safelight.NexeModuleLoader} nexeModuleLoader
 */
safelight.NaclSniffer = function($q, nexeModuleLoader) {
  /** @private @type {string} */
  this.naclArchitecture_ = '';

  /** @private @type {!Array<string>} */
  this.halideTargets_ = [];

  /** @private @type {!angular.$q} */
  this.$q_ = $q;

  /** @private @type {!safelight.NexeModule} */
  this.nexeModule_ = nexeModuleLoader.load('/nacl_sniffer.nmf');
};

/**
 * Return a Promise that will resolve to the architecture (or #error).
 *
 * @return {!angular.$q.Promise} promise Angular promise object.
 */
safelight.NaclSniffer.prototype.getArchitecture = function() {
  /** @type {!angular.$q.Deferred} */
  var deferred = this.$q_.defer();
  if (this.naclArchitecture_ != '') {
    if (this.naclArchitecture_ != '#error') {
      deferred.resolve(this.naclArchitecture_);
    } else {
      deferred.reject(this.naclArchitecture_);
    }
  } else {
    if (this.nexeModule_) {
      this.nexeModule_.request('sniff_architecture', {})
          .then(
              function(success) {
                this.naclArchitecture_ = success['success']['architecture'];
                deferred.resolve(this.naclArchitecture_);
              }.bind(this),
              function(failure) {
                this.naclArchitecture_ = '#error';
                deferred.reject(this.naclArchitecture_);
              }.bind(this));
    } else {
      // Shouldn't be possible, but let's check.
      deferred.reject('#error');
    }
  }
  return deferred.promise;
};

/**
 * Return a Promise that will resolve to an array of valid Halide targets.
 *
 * @return {!angular.$q.Promise} promise Angular promise object.
 */
safelight.NaclSniffer.prototype.getHalideTargets = function() {
  /** @type {!angular.$q.Deferred} */
  var deferred = this.$q_.defer();
  if (this.halideTargets_.length) {
    if (this.halideTargets_[0] != '#error') {
      deferred.resolve(this.halideTargets_);
    } else {
      deferred.reject(this.halideTargets_);
    }
  } else {
    if (this.nexeModule_) {
      this.nexeModule_.request('sniff_halide_targets', {})
          .then(
              function(success) {
                this.halideTargets_ = success['success']['halide_targets'];
                deferred.resolve(this.halideTargets_);
              }.bind(this),
              function(failure) {
                this.halideTargets_ = ['#error'];
                deferred.reject(this.halideTargets_);
              }.bind(this));
    } else {
      // Shouldn't be possible, but let's check.
      deferred.reject(['#error']);
    }
  }
  return deferred.promise;
};

/** @const {!angular.Module} */
safelight.naclSniffer.module =
  angular.module('safelight.naclSniffer.module', [
    safelight.alerter.module.name,
    safelight.nexeModuleLoader.module.name
  ])
  .service('naclSniffer', safelight.NaclSniffer);

