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

/**
 * @fileoverview Contains unit tests for the Builder service.
 */
'use strict';

goog.setTestOnly();

goog.require('safelight.Argument');
goog.require('safelight.Buffer');
goog.require('safelight.defaultInputValues.module');
goog.require('safelight.filterManager.module');

describe('safelight.FilterManager', function() {
  var filterManager, $httpBackend, $q, $rootScope, defaultInputValues,
      nexeModuleLoader;

  // Arbitrary: SHA256 of the string 'hash'
  var SIG = '23615DDBB04C4F5976DE4D70671A928A1904D15A7E3B573E1E5DADEF24802110';

  var TARGET_NACL = 'x86-64-linux';
  var DEVICE_NACL = 'chrome';

  var NUM_THREADS = 1;

  var EXPECTED_LOG = 'Here is the log from running the Halide filter.';
  var EXPECTED_TIME_USEC = 42;

  var SIDE_LENGTH = 2;
  var EXPECTED_PIXELS_PROCESSED = SIDE_LENGTH * SIDE_LENGTH;

  var JSON_DESCRIPTION_RESULT_NACL = {
    success: {
      description: JSON.stringify({
        version: 0,
        name: 'foo',
        target: TARGET_NACL,
        arguments: [
          {
            dimensions: 3,
            kind: 1,
            name: 'input1',
            type_bits: 8,
            type_code: 'uint'
          },
          {
            def: 0.5,
            kind: 0,
            max: 1,
            min: 0,
            name: 'blend_alpha',
            type_bits: 32,
            type_code: 'float'
          },
          {
            dimensions: 3,
            kind: 2,
            name: '$result_0',
            type_bits: 8,
            type_code: 'uint'
          }
        ]
      })
    },
    log: ''
  };

  var JSON_CALL_INPUTS_BASE64 = {
    inputs: {
      input1: {
        host: 'AH8AfwAAf38AAH8//////w==',
        extent: [SIDE_LENGTH, SIDE_LENGTH, 4, 0],
        stride: [1, SIDE_LENGTH, SIDE_LENGTH * SIDE_LENGTH, 0],
        min: [0, 0, 0, 0],
        elem_size: 1,
        dimensions: 3,
        type_code: 'uint'
      },
      blend_alpha: 0.5
    },
  };

  var JSON_CALL_RESULT_NACL = {
    success: {
      outputs: {
        '$result_0': {
          dimensions: 3,
          elem_size: 1,
          extent: [SIDE_LENGTH, SIDE_LENGTH, 4, 0],
          host: {},  // really an ArrayBuffer
          min: [0, 0, 0, 0],
          stride: [1, SIDE_LENGTH, SIDE_LENGTH * SIDE_LENGTH, 0],
          type_code: 'uint'
        }
      },
      time_usec: EXPECTED_TIME_USEC,
    },
    log: EXPECTED_LOG
  };

  var JSON_CALL_RESULT_BASE64 = {
    success: {
      outputs: {
        '$result_0': {
          dimensions: 3,
          elem_size: 1,
          extent: [SIDE_LENGTH, SIDE_LENGTH, 4, 0],
          host: 'AH8AfwAAf38AAH8//////w==',
          min: [0, 0, 0, 0],
          stride: [1, SIDE_LENGTH, SIDE_LENGTH * SIDE_LENGTH, 0],
          type_code: 'uint'
        }
      },
      time_usec: EXPECTED_TIME_USEC,
    },
    log: EXPECTED_LOG
  };

  var EXPECTED_ARGUMENTS = [
    safelight.Argument.fromDict({
      name: 'input1',
      kind: 1,
      dimensions: 3,
      type_code: 'uint',
      type_bits: 8
    }),
    safelight.Argument.fromDict({
      name: 'blend_alpha',
      kind: 0,
      type_code: 'float',
      type_bits: 32,
      def: 0.5,
      min: 0,
      max: 1
    }),
    safelight.Argument.fromDict({
      name: '$result_0',
      kind: 2,
      dimensions: 3,
      type_code: 'uint',
      type_bits: 8
    })
  ];

  var EXPECTED_CHANGED_VALUES_AFTER_LOAD = {
    input1: safelight.Buffer.fromDict({
      host: new ArrayBuffer(),
      extent: [SIDE_LENGTH, SIDE_LENGTH, 4, 0],
      stride: [1, SIDE_LENGTH, SIDE_LENGTH * SIDE_LENGTH, 0],
      min: [0, 0, 0, 0],
      elem_size: 1,
      dimensions: 3,
      type_code: 'uint'
    }),
    blend_alpha: 0.5,
    $result_0: null,
    $log: '',
    $time_usec: 0,
    $pixels_processed: 0
  };

  var EXPECTED_CHANGED_VALUES_AFTER_RUN_NACL = {
    $result_0: safelight.Buffer.fromDict({
      dimensions: 3,
      elem_size: 1,
      extent: [SIDE_LENGTH, SIDE_LENGTH, 4, 0],
      host: {},
      min: [0, 0, 0, 0],
      stride: [1, SIDE_LENGTH, SIDE_LENGTH * SIDE_LENGTH, 0],
      type_code: 'uint'
    }),
    $log: EXPECTED_LOG,
    $time_usec: EXPECTED_TIME_USEC,
    $pixels_processed: EXPECTED_PIXELS_PROCESSED
  };

  var EXPECTED_CHANGED_VALUES_AFTER_RUN_BASE64 = {
    $result_0: safelight.Buffer.fromBase64Dict({
      dimensions: 3,
      elem_size: 1,
      extent: [SIDE_LENGTH, SIDE_LENGTH, 4, 0],
      host: 'AH8AfwAAf38AAH8//////w==',
      min: [0, 0, 0, 0],
      stride: [1, SIDE_LENGTH, SIDE_LENGTH * SIDE_LENGTH, 0],
      type_code: 'uint'
    }),
    $log: EXPECTED_LOG,
    $time_usec: EXPECTED_TIME_USEC,
    $pixels_processed: EXPECTED_PIXELS_PROCESSED
  };

  var EXPECTED_VALUES_AFTER_RUN_NACL = {
    input1: safelight.Buffer.fromDict({
      host: new ArrayBuffer(),
      extent: [SIDE_LENGTH, SIDE_LENGTH, 4, 0],
      stride: [1, SIDE_LENGTH, SIDE_LENGTH * SIDE_LENGTH, 0],
      min: [0, 0, 0, 0],
      elem_size: 1,
      dimensions: 3,
      type_code: 'uint'
    }),
    blend_alpha: 0.5,
    $result_0: safelight.Buffer.fromDict({
      dimensions: 3,
      elem_size: 1,
      extent: [SIDE_LENGTH, SIDE_LENGTH, 4, 0],
      host: {},
      min: [0, 0, 0, 0],
      stride: [1, SIDE_LENGTH, SIDE_LENGTH * SIDE_LENGTH, 0],
      type_code: 'uint'
    }),
    $log: EXPECTED_LOG,
    $time_usec: EXPECTED_TIME_USEC,
    $pixels_processed: EXPECTED_PIXELS_PROCESSED
  };

  var EXPECTED_VALUES_AFTER_RUN_BASE64 = {
    input1: safelight.Buffer.fromBase64Dict({
      host: 'AH8AfwAAf38AAH8//////w==',
      extent: [SIDE_LENGTH, SIDE_LENGTH, 4, 0],
      stride: [1, SIDE_LENGTH, SIDE_LENGTH * SIDE_LENGTH, 0],
      min: [0, 0, 0, 0],
      elem_size: 1,
      dimensions: 3,
      type_code: 'uint'
    }),
    blend_alpha: 0.5,
    $result_0: safelight.Buffer.fromBase64Dict({
      dimensions: 3,
      elem_size: 1,
      extent: [SIDE_LENGTH, SIDE_LENGTH, 4, 0],
      host: 'AH8AfwAAf38AAH8//////w==',
      min: [0, 0, 0, 0],
      stride: [1, SIDE_LENGTH, SIDE_LENGTH * SIDE_LENGTH, 0],
      type_code: 'uint'
    }),
    $log: EXPECTED_LOG,
    $time_usec: EXPECTED_TIME_USEC,
    $pixels_processed: EXPECTED_PIXELS_PROCESSED
  };

  beforeEach(module(
      safelight.filterManager.module.name,
      // Mock nexeModuleLoader
      function($provide) {
        $provide.value('nexeModuleLoader', {
          load: function(path) {
            var valid =
                (path == ('/safelight_' + SIG + '_' + TARGET_NACL + '.nmf'));
            return {
              request: function(verb, data) {
                var deferred = $q.defer();
                if (!valid) {
                  deferred.reject({'failure': 'Invalid Path: ' + path});
                } else if (verb == 'describe') {
                  deferred.resolve(JSON_DESCRIPTION_RESULT_NACL);
                } else if (verb == 'call') {
                  deferred.resolve(JSON_CALL_RESULT_NACL);
                } else {
                  deferred.reject({'failure': 'Unknown Verb: ' + verb});
                }
                return deferred.promise;
              },
              unload: function() { valid = false; }
            };
          }
        });
      }));

  beforeEach(inject(
      function(_$httpBackend_, _$q_, _$rootScope_, _defaultInputValues_,
          _nexeModuleLoader_, _filterManager_) {
        $httpBackend = _$httpBackend_;
        $q = _$q_;
        $rootScope = _$rootScope_;
        defaultInputValues = _defaultInputValues_;
        nexeModuleLoader = _nexeModuleLoader_;
        filterManager = _filterManager_;

        $httpBackend
          .when('POST', /.*/)
          .respond(500, 'ERROR: build failed.');

        filterManager.setDefaultBufferSideLength(SIDE_LENGTH);
      }
    ));

  it('should fail to run before loading', function() {
    var listener = jasmine.createSpy('listener');
    var remover = filterManager.addActiveFilterChangedListener(listener);

    var promise = filterManager.run(NUM_THREADS);
    expect(promise).not.toBeNull();
    var success = jasmine.createSpy('success');
    var failure = jasmine.createSpy('failure');
    promise.then(success, failure);
    $rootScope.$digest();  // allow promises to be processed
    expect(success).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalled();

    expect(listener).not.toHaveBeenCalled();
    expect(remover()).toBe(true);
  });

  it('should fail for an invalid path', function() {
    var listener = jasmine.createSpy('listener');
    var remover = filterManager.addActiveFilterChangedListener(listener);

    var promise = filterManager.loadFilter({
      'signature': 'bogus.signature',
      'target': TARGET_NACL,
      'device': DEVICE_NACL
    });
    expect(promise).not.toBeNull();
    var success = jasmine.createSpy('success');
    var failure = jasmine.createSpy('failure');
    promise.then(success, failure);
    $rootScope.$digest();  // allow promises to be processed
    expect(success).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalled();

    expect(listener).toHaveBeenCalledWith([]);
    expect(remover()).toBe(true);
  });

  it('should load and run properly (NaCl)', function() {
    var listener = jasmine.createSpy('listener');
    var remover = filterManager.addActiveFilterChangedListener(listener);
    var valuesListener = jasmine.createSpy('valuesListener');
    var valuesRemover = filterManager.addValuesChangedListener(valuesListener);
    var promise = filterManager.loadFilter({
      'signature': SIG,
      'target': TARGET_NACL,
      'device': DEVICE_NACL
    });
    expect(promise).not.toBeNull();
    var success = jasmine.createSpy('success');
    var failure = jasmine.createSpy('failure');
    promise.then(success, failure);
    $rootScope.$digest();  // allow promises to be processed
    expect(failure).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledWith(SIG);
    expect(listener).toHaveBeenCalledWith(EXPECTED_ARGUMENTS);
    expect(valuesListener)
        .toHaveBeenCalledWith(EXPECTED_CHANGED_VALUES_AFTER_LOAD);
    expect(remover()).toBe(true);
    expect(valuesRemover()).toBe(true);

    var listener = jasmine.createSpy('listener');
    var remover = filterManager.addActiveFilterChangedListener(listener);
    var valuesListener = jasmine.createSpy('valuesListener');
    var valuesRemover = filterManager.addValuesChangedListener(valuesListener);
    var promise = filterManager.run(NUM_THREADS);
    expect(promise).not.toBeNull();
    var success = jasmine.createSpy('success');
    var failure = jasmine.createSpy('failure');
    promise.then(success, failure);
    $rootScope.$digest();  // allow promises to be processed
    expect(success).toHaveBeenCalledWith(EXPECTED_VALUES_AFTER_RUN_NACL);
    expect(failure).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    expect(valuesListener)
        .toHaveBeenCalledWith(EXPECTED_CHANGED_VALUES_AFTER_RUN_NACL);
    expect(remover()).toBe(true);
    expect(valuesRemover()).toBe(true);

    filterManager.unload();

    // run() should fail after unload()
    var listener = jasmine.createSpy('listener');
    var remover = filterManager.addActiveFilterChangedListener(listener);
    var promise = filterManager.run(NUM_THREADS);
    expect(promise).not.toBeNull();
    var success = jasmine.createSpy('success');
    var failure = jasmine.createSpy('failure');
    promise.then(success, failure);
    $rootScope.$digest();  // allow promises to be processed
    expect(success).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    expect(remover()).toBe(true);
  });

});
