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
goog.provide('safelight.ParameterPanelController');

goog.require('safelight.Argument');
goog.require('safelight.FilterManager');



/**
 * Controller for safelight.ParameterPanelDirective.
 *
 * @struct @ngInject @export @constructor
 *
 * @param {!angular.Scope} $scope
 * @param {!angular.$timeout} $timeout
 * @param {!safelight.Alerter} alerter
 * @param {!safelight.FilterManager} filterManager
 */
safelight.ParameterPanelController = function($scope,
                                              $timeout,
                                              alerter,
                                              filterManager) {
  /** @private @const {!safelight.Alerter} */
  this.alerter_ = alerter;

  /** @private @const {!safelight.FilterManager} */
  this.filterManager_ = filterManager;

  /** @private @const {!angular.$timeout} */
  this.$timeout_ = $timeout;

  /** @export @type {string} */
  this.name = '';

  /** @export @type {boolean} */
  this.input = true;

  /** @export @type {!Array<!Object>} */
  this.uiTypes = [];

  /** @export @type {!Object<string, ?Object|boolean|number>} */
  this.values = {};

  /** @type {function():boolean} */
  var remover = this.filterManager_.addActiveFilterChangedListener(
      this.onActiveFilterChanged_.bind(this));
  $scope.$on('$destroy', remover);

  /** @type {function():boolean} */
  var valueRemover = this.filterManager_.addValuesChangedListener(
      this.onValuesChanged_.bind(this));
  $scope.$on('$destroy', valueRemover);
};


/**
 * Listener that is called when the active filter is changed
 * (though this could mean "the existing filter was rebuilt with no
 * apparent changes" in addition to "completely different filter now").
 * In response, we update the expected uiTypes, mutating or creating
 * new values for each if necessary.
 *
 * @private
 * @param {!Array<!safelight.Argument>} args
 */
safelight.ParameterPanelController.prototype.onActiveFilterChanged_ =
    function(args) {
  /** @type {!Array<!Object>} */
  var uiTypes = [];
  var values = {};
  for (var i = 0; i < args.length; ++i) {
    /** @type {!safelight.Argument} */
    var a = args[i];
    /** @type {string} */
    var type = '';
    /** {Object|undefined} */
    var min;
    /** {Object|undefined} */
    var max;
    /** {Object|undefined} */
    var step;
    /** @type {boolean} */
    var slider = false;
    if (a.isBuffer()) {
      type = 'image';
    } else if (a.type_code == 'uint' && a.type_bits == 1) {
      type = 'boolean';
    } else {
      type = 'number';
      min = a.min !== undefined ? a.min : Number.NEGATIVE_INFINITY;
      max = a.max !== undefined ? a.max : Number.POSITIVE_INFINITY;
      /** @type {number} */
      var type_min;
      /** @type {number} */
      var type_max;
      switch (a.type_code) {
        case 'int':
          step = 1;
          // JS numeric rules mean that (1<<N-1)-1 won't give
          // you want you want, so let's just nuke it from orbit.
          type_min = -Math.pow(2, (a.type_bits - 1));
          type_max = Math.pow(2, (a.type_bits - 1)) - 1;
          break;
        case 'uint':
          step = 1;
          type_min = 0;
          type_max = Math.pow(2, a.type_bits) - 1;
          break;
        case 'float':
          step = (max - min) / 100.0;
          if (Math.abs(step) > 1e10) {
            // step is huge -- just make it undefined rather than
            // enabling weird step arrows in the UI
            step = undefined;
          }
          // Use the maximum value for a float32 as our "infinity" here.
          type_min = -3.4e38;
          type_max = 3.4e38;
          break;
      }
      slider = isFinite(min) && isFinite(max) &&
               min >= type_min && max <= type_max;
    }
    uiTypes.push({
      'name': a.name,
      'type': type,
      'min': min,
      'max': max,
      'step': step,
      'slider': slider,
      'input': a.isInput()
    });
    if (a.isInput() == this.input) {
      values[a.name] = null;
    }
  }
  this.uiTypes = uiTypes;
  this.values = values;
};


/**
 * Listener that is called when the values for the active filter are changed
 *
 * @private
 * @param {!Object<string, ?Object|boolean|number>} values
 */
safelight.ParameterPanelController.prototype.onValuesChanged_ =
    function(values) {
  // We have to set the values on the processing cycle after we set min/max;
  // otherwise, sliders get stuck at max. Yes, this is suboptimal.
  this.$timeout_(function() {
    for (var name in values) {
      this.values[name] = values[name];
    }
  }.bind(this));
};


/**
 * onParameterChanged() is called by the UI when a value in the active
 * filter's value set has been updated.
 *
 * @export
 * @param {string} name name of parameter changed
 */
safelight.ParameterPanelController.prototype.onParameterChanged =
    function(name) {
  var changed = {};
  changed[name] = this.values[name];
  this.filterManager_.onValuesChanged(changed);
};

