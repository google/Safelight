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

goog.require('safelight.builder.module');
goog.require('safelight.naclSniffer.module');



describe('safelight.Builder', function() {
  var builder, $httpBackend, $rootScope, $timeout, $q, naclSniffer;
  var buildLog = 'My log saw something... something significant.';
  // Arbitrary: SHA256 of the string 'hash'
  var signature =
      '23615DDBB04C4F5976DE4D70671A928A1904D15A7E3B573E1E5DADEF24802110';

  var target_nacl = 'x86-64-nacl';
  var assembly_nacl = 'Here is NaCl assembly code';
  var device_nacl = 'chrome';
  var successfulBuildInfo_nacl = {
    'signature': signature,
    'target': target_nacl,
    'device': device_nacl
  };

  var test_sets = [
    {
      'activeTargetName': 'Chrome (' + target_nacl + ')',
      'target': target_nacl,
      'assembly': assembly_nacl,
      'device': device_nacl,
      'successfulBuildInfo': {
        'signature': signature,
        'target': target_nacl,
        'device': device_nacl
      }
    }
  ];

  beforeEach(module(
    safelight.builder.module.name,
    // Mock $cookies
    function($provide) {
      $provide.value('$cookies', {
        functionName: 'uu',
        pathToGen: '//foo:bar',
        activeTargetName: 'Chrome (x86-64-nacl)',
        pathToGenHistory: '//foo:bar,//foo:baz'
      });
    },
    // Mock naclSniffer
    function($provide) {
      $provide.value('naclSniffer', {
        getHalideTargets: function() {
          var deferred = $q.defer();
          deferred.resolve([
            'x86-64-nacl-sse41',
            'x86-64-nacl'
          ]);
          return deferred.promise;
        }
      });
    }
  ));

  beforeEach(inject(
    function(_$httpBackend_, _$rootScope_, _$timeout_, _$q_) {
      $httpBackend = _$httpBackend_;
      $q = _$q_;
      $rootScope = _$rootScope_;
      $timeout = _$timeout_;

      $httpBackend
        .when('GET', '/buildlog')
        .respond(buildLog);

      $httpBackend
        .when('GET', '/targets')
        .respond('//foo:bar,//foo:baz');

      $httpBackend
        .when('GET', '/safelight_' + signature + '_' + target_nacl + '.s')
        .respond(assembly_nacl);

      $httpBackend
        .when('POST', /.*/)
        .respond(500, 'ERROR: build failed.');
    },
    // Must inject in two stages, as we need $q to be set before instantiating
    // a builder
    function(_naclSniffer_, _builder_) {
      naclSniffer = _naclSniffer_;
      builder = _builder_;
      $rootScope.$digest();  // allow promises to be processed
    }
  ));

  it('should mock the cookies', function() {
    expect(builder.functionName).toBe('uu');
    expect(builder.activeTargetName).toBe('Chrome (x86-64-nacl)');
    expect(builder.pathToGen).toBe('//foo:bar');
    expect(builder.pathToGenHistory).toEqual(['//foo:bar', '//foo:baz']);
  });

  it('should query targets and devices', function() {
    $httpBackend.flush();  // allow $http queries to finish
    expect(builder.buildTargetNames).toEqual([
      'Chrome (x86-64-nacl)',
      'Chrome (x86-64-nacl-sse41)',
    ]);
  });

  it('should build without error', function() {
    $httpBackend.flush();  // allow $http queries to finish
    for (var i in test_sets) {
      var test_set = test_sets[i];
      var listener = jasmine.createSpy('listener');
      var remover = builder.addBuildListener(listener);
      builder.activeTargetName = test_set['activeTargetName'];
      var promise = builder.build();
      expect(promise).not.toBeNull();
      var success = jasmine.createSpy('success');
      var failure = jasmine.createSpy('failure');
      var notify = jasmine.createSpy('notify');
      promise.then(success, failure, notify);
      $httpBackend.flush();  // allow $http queries to finish
      $rootScope.$digest();  // allow promises to be processed
      expect(success).toHaveBeenCalledWith(test_set['successfulBuildInfo']);
      expect(failure).not.toHaveBeenCalled();
      // notify will always be called at least once.
      expect(notify).toHaveBeenCalledWith(buildLog);
      expect(listener).toHaveBeenCalledWith(test_set['successfulBuildInfo']);
      expect(remover()).toBe(true);
    }
  });

  it('should fail to build', function() {
    builder.functionName = 'Evil_User';
    var listener = jasmine.createSpy('listener');
    var remover = builder.addBuildListener(listener);
    var promise = builder.build();
    expect(promise).not.toBeNull();
    var success = jasmine.createSpy('success');
    var failure = jasmine.createSpy('failure');
    var notify = jasmine.createSpy('notify');
    promise.then(success, failure, notify);
    $httpBackend.flush();  // allow $http queries to finish
    $rootScope.$digest();  // allow promises to be processed
    expect(success).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalled();
    // notify will always be called at least once.
    expect(notify).toHaveBeenCalledWith(buildLog);
    expect(listener).toHaveBeenCalledWith(null);
    expect(remover()).toBe(true);
  });

  it('should get assembly without error', function() {
    $httpBackend.flush();  // allow $http queries to finish
    for (var i in test_sets) {
      var test_set = test_sets[i];
      builder.activeTargetName = test_set['activeTargetName'];
      var promise = builder.build();
      expect(promise).not.toBeNull();
      var success = jasmine.createSpy('success');
      promise.then(success);
      $httpBackend.flush();  // allow $http queries to finish
      $rootScope.$digest();  // allow promises to be processed
      expect(success).toHaveBeenCalledWith(test_set['successfulBuildInfo']);

      var promise = builder.getAssembly(signature, test_set['target']);
      var success = jasmine.createSpy('success');
      promise.then(success);
      $httpBackend.flush();  // allow $http queries to finish
      $rootScope.$digest();  // allow promises to be processed
      expect(success).toHaveBeenCalledWith(test_set['assembly']);
    }
  });

  it('should get stmt url without error', function() {
    $httpBackend.flush();  // allow $http queries to finish
    for (var i in test_sets) {
      var test_set = test_sets[i];
      builder.activeTargetName = test_set['activeTargetName'];
      var promise = builder.build();
      expect(promise).not.toBeNull();
      var success = jasmine.createSpy('success');
      promise.then(success);
      $httpBackend.flush();  // allow $http queries to finish
      $rootScope.$digest();  // allow promises to be processed
      expect(success).toHaveBeenCalledWith(test_set['successfulBuildInfo']);

      var url = builder.getStmtHtmlURL(signature, test_set['target']);
      expect(url).toEqual('/safelight_' + signature + '_' + test_set['target'] +
                          '.html');
    }
  });
});

