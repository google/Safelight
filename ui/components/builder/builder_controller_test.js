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
 * @fileoverview Contains unit tests for the builder controller.
 */
'use strict';

goog.setTestOnly();



describe('safelight.BuilderController', function() {
  var $controller, $q, $rootScope;
  var builderCtrl, scope, deferred;
  var buildLog = 'My log saw something... something significant.';
  // Arbitrary: SHA256 of the string 'hash'
  var successHash =
      '23615DDBB04C4F5976DE4D70671A928A1904D15A7E3B573E1E5DADEF24802110';
  var error = jasmine.createSpy('error');
  var warning = jasmine.createSpy('warning');
  var dismiss = jasmine.createSpy('dismiss');
  var dismissAll = jasmine.createSpy('dismissAll');

  beforeEach(module(
    // Mock alerter
    function($provide) {
      $provide.value('alerter', {
        error: error,
        warning: warning,
        dismiss: dismiss,
        dismissAll: dismissAll
      });
    },
    // Mock builder
    function($provide) {
      $provide.value('builder', {
        build: function() {
          deferred = $q.defer();
          return deferred.promise;
        },
      });
    }
  ));

  beforeEach(inject(
    function(_$controller_, _$q_, _$rootScope_) {
      $controller = _$controller_;
      $q = _$q_;
      $rootScope = _$rootScope_;
      scope = $rootScope.$new();
      builderCtrl = $controller(safelight.BuilderController, {
        $scope: scope
      });
    }
  ));

  it('should respond to successful build() correctly', function() {
    expect(builderCtrl.buildInProgress).toBe(false);
    expect(builderCtrl.buildLog).toBe('');

    builderCtrl.build();

    expect(builderCtrl.buildInProgress).toBe(true);

    deferred.notify(buildLog);
    deferred.resolve(successHash);

    $rootScope.$digest();  // allow promises to be processed

    expect(error).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
    expect(dismissAll).toHaveBeenCalled();

    expect(builderCtrl.buildInProgress).toBe(false);
    expect(builderCtrl.buildLog).toBe(buildLog);
  });

  it('should respond to failing build() correctly', function() {
    expect(builderCtrl.buildInProgress).toBe(false);
    expect(builderCtrl.buildLog).toBe('');

    builderCtrl.build();

    expect(builderCtrl.buildInProgress).toBe(true);

    deferred.notify(buildLog);
    deferred.reject('Nope.');

    $rootScope.$digest();  // allow promises to be processed

    expect(error).toHaveBeenCalledWith('Nope.');
    expect(warning).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
    expect(dismissAll).toHaveBeenCalled();

    expect(builderCtrl.buildInProgress).toBe(false);
    expect(builderCtrl.buildLog).toBe(buildLog);
  });
});
