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
goog.provide('safelight.NexeModule');
goog.provide('safelight.NexeModuleLoader');
goog.provide('safelight.nexeModuleLoader.module');



/**
 * NexeModuleLoader is a service that loads NaCl modules (usually .nexe, though
 * .pexe could also be supported); it also provides a Promise-based
 * way to send and receive messages.
 *
 *   { verb: "some-string", data: { ... } }
 *
 * to which it will respond
 *
 *   { verb: "$response", id: "unique-string", success: { ... }, log: '...' }
 *
 *   or
 *
 *   { verb: "$response", id: "unique-string", failure: "error message" }
 *
 * Note that the the id field of the response is an arbitrary string and
 * always matches the id field of the request; NexeModule will ensure
 * that the response will only be delivered to the promise for the corresponding
 * request.
 *
 * @struct @ngInject @constructor
 * @param {!angular.$compile} $compile
 * @param {Object} $document
 * @param {!angular.$q} $q
 * @param {Object} $rootScope
 * @param {!angular.$timeout} $timeout
 */
safelight.NexeModuleLoader = function($compile, $document, $q, $rootScope,
                                      $timeout) {
  /** @private @type {!angular.$compile} */
  this.$compile_ = $compile;

  /** @private @type {Object} */
  this.$document_ = $document;

  /** @private @type {!angular.$q} */
  this.$q_ = $q;

  /** @private @type {Object} */
  this.$rootScope_ = $rootScope;

  /** @private @type {!angular.$timeout} */
  this.$timeout_ = $timeout;

  /** @private @type {number} */
  this.nextId_ = 1;
};

/**
 * Begin loading the .nexe from the given .nmf. Loading has no intrinsic
 * error checking; you can immediately send request()'s to the object returned,
 * and they will be processed when loading is complete (or rejected if loading
 * eventually fails).
 *
 * @param {string} nmfPath The path to the .nmf to be loaded.
 * @return {!safelight.NexeModule} The .nexe module.
 */
safelight.NexeModuleLoader.prototype.load = function(nmfPath) {
  var id = this.nextId_++;
  return new safelight.NexeModule(this.$compile_, this.$document_, this.$q_,
                                  this.$rootScope_, this.$timeout_, nmfPath,
                                  id);
};

/**
 * Enum for tri-state values.
 * @enum {number}
 */
safelight.LoadStatus = {
  PENDING: 0,
  LOADED: 1,
  FAILED: 2
};

/**
 * Send a request to the .nexe, in the verb-plus-data form specified
 * by NexeModuleLoader. Note that the 'id' field is managed privately
 * by NexeModule.
 *
 * @struct @ngInject @constructor
 * @param {!angular.$compile} $compile
 * @param {Object} $document
 * @param {!angular.$q} $q
 * @param {Object} $rootScope
 * @param {!angular.$timeout} $timeout
 * @param {string} nmfPath The path to the .nmf to be loaded.
 * @param {number} id Unique id to use in naming this instance.
 */
safelight.NexeModule = function($compile, $document, $q, $rootScope, $timeout,
                                nmfPath, id) {
  /** @private @type {string} */
  this.id_ = String(id);

  /** @private @type {number} */
  this.nextRequestId_ = 1;

  /** @private @type {!angular.$q} */
  this.$q_ = $q;

  /** @private @type {!angular.$timeout} */
  this.$timeout_ = $timeout;

  /** @private @type {!angular.JQLite} */
  this.nexeListener_ = angular.element('<div></div>');

  /** @private @type {!angular.JQLite} */
  this.nexeEmbed_ =
      angular.element('<embed id="nacl_nexe_embed_' + this.id_ + '" ' +
                      'width=1 height=1 ' +
                      'src="' + nmfPath + '" ' +
                      'type="application/x-nacl" ' +
                      '/>');

  /** @private @type {!Array<Object>} */
  this.pendingRequests_ = [];

  /** @private @type {Object} */
  this.pendingResponses_ = {};

  /** @private @type {safelight.LoadStatus} */
  this.loadStatus_ = safelight.LoadStatus.PENDING;

  var body = $document.find('body').eq(0);
  var nexeScope = $rootScope.$new(true);
  body.append($compile(this.nexeListener_)(nexeScope));
  // $compile()() is only typedef'ed as Object, but we know it's really
  // Element in this case: typecast to the rescue
  var nexeEmbedDomEl =
      /** @type {!Element} */ ($compile(this.nexeEmbed_)(nexeScope));
  this.nexeListener_.append(nexeEmbedDomEl);

  var failure = this.handleLoadFailure_.bind(this);
  var success = this.handleLoadSuccess_.bind(this);
  var message = this.handleMessage_.bind(this);
  var timeout = function() {
    var naclIsEnabled = this.nexeEmbed_[0].readyState !== undefined;
    if (!naclIsEnabled) {
      this.removeModule_();
    }
  }.bind(this);

  this.nexeListener_[0].addEventListener('error', failure, true);
  this.nexeListener_[0].addEventListener('crash', failure, true);
  this.nexeListener_[0].addEventListener('load', success, true);
  this.nexeListener_[0].addEventListener('message', message, true);

  // Have to do this as $timeout_(,0) to allow the DOM to update.
  // (Alternately, we could force the issue via $scope.$apply()).
  this.$timeout_(timeout, 0);
};

/**
 * Send a verb-plus-data request to the nexe module. If the request
 * succeeds, the promise will be resolved with the 'success' object from
 * the response; if the request fails, the promise will be rejected with
 * the 'failure' string from the response.
 *
 * @param {string} verb The verb for the request
 * @param {Object} data The verb-specific data for the request
 * @return {!angular.$q.Promise} promise Angular promise object.
 */
safelight.NexeModule.prototype.request = function(verb, data) {
  /** @type {!angular.$q.Deferred} */
  var deferred = this.$q_.defer();
  // It's overkill to include this.id_ here, but it can make debugging easier.
  var requestId = this.id_ + '_' + String(this.nextRequestId_++);
  var request = {
    'verb': verb,
    'id': requestId,
    'data': data
  };
  this.processRequest_(request, deferred);
  return deferred.promise;
};

/**
 * Unload the .nexe module. Any pending requests will be rejected, as will
 * all future calls to request(). Call this only when you are completely
 * finished using a given .nexe module.
 */
safelight.NexeModule.prototype.unload = function() {
  this.removeModule_();
};

/**
 * @private
 * @param {Object} request The request dictionary to process
 * @param {!angular.$q.Deferred} deferred The Deferred managing the promise
 * for the request
 */
safelight.NexeModule.prototype.processRequest_ = function(request, deferred) {
  var requestId = request['id'];
  switch (this.loadStatus_) {
    case safelight.LoadStatus.LOADED:
      this.pendingResponses_[requestId] = deferred;
      this.nexeEmbed_[0].postMessage(request);
      break;
    case safelight.LoadStatus.FAILED:
      deferred.reject({failure: 'Load failed', log: ''});
      break;
    default:
      this.pendingRequests_.push({'request': request, 'deferred': deferred});
      break;
  }
};

/**
 * @private
 */
safelight.NexeModule.prototype.processPendingRequests_ = function() {
  /** @type {!Array<Object>} */
  var pendingRequests = this.pendingRequests_;
  this.pendingRequests_ = [];
  for (var i = 0; i < pendingRequests.length; ++i) {
    var request = pendingRequests[i]['request'];
    var deferred = pendingRequests[i]['deferred'];
    this.processRequest_(request, deferred);
  }
};

/**
 * @private
 */
safelight.NexeModule.prototype.handleLoadSuccess_ = function() {
  this.loadStatus_ = safelight.LoadStatus.LOADED;
  this.processPendingRequests_();
};

/**
 * @private
 */
safelight.NexeModule.prototype.handleLoadFailure_ = function() {
  this.removeModule_();
  // removeModule() will call processPendingRequests(), so we don't need to
  // call it here.
};

/**
 * @private
 */
safelight.NexeModule.prototype.removeModule_ = function() {
  this.nexeListener_.remove();
  this.loadStatus_ = safelight.LoadStatus.FAILED;
  // Any pending requests will be rejected with failure.
  this.processPendingRequests_();
};

/**
 * @param {Object} message
 * @private
 */
safelight.NexeModule.prototype.handleMessage_ = function(message) {
  if (message.data['verb'] == '$response') {
    var requestId = message.data['id'];
    var deferred = this.pendingResponses_[requestId];
    if (deferred) {
      delete this.pendingResponses_[requestId];
      var success = message.data['success'];
      var failure = message.data['failure'];
      var log = message.data['log'] || '';
      if (success) {
        deferred.resolve({'success': success, 'log': log});
      } else {
        deferred.reject({'failure': failure, 'log': log});
      }
    }
  }
};

/** @const {!angular.Module} */
safelight.nexeModuleLoader.module =
    angular.module('safelight.nexeModuleLoader.module', [])
        .service('nexeModuleLoader', safelight.NexeModuleLoader);
