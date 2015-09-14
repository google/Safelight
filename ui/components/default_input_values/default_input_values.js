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
goog.provide('safelight.DefaultInputValues');
goog.provide('safelight.defaultInputValues.module');

goog.require('safelight.Argument');
goog.require('safelight.Buffer');



/**
 * A utility service to provide functions to fill in useful defaults
 * for Safelight inputs.
 *
 * @struct @ngInject @constructor
 */
safelight.DefaultInputValues = function() {
};


/**
 * A utility function for makeInputBuffer(); this fills in
 * the channels of a Buffer using a simple, predictable pseudorandom
 * algorithm to provide plausible sample buffers for otherwise-unspecified
 * Input Buffers.
 *
 * @private
 * @param {Object} buffer Input buffer.
 * @param {number} max Maximum component value.
 * @param {!Array<number>} extents Extents for each dimension.
 * @param {!Array<number>} stride Stride for each dimension.
 * @param {number} seed Random number seed.
 */
safelight.DefaultInputValues.prototype.fillBuffer_ = function(buffer,
                                                              max,
                                                              extents,
                                                              stride,
                                                              seed) {
  /** @type {number} */
  var i0 = 0;
  for (/** @type {number} */ var a = 0; a < Math.max(1, extents[0]); ++a) {
    /** @type {number} */
    var i1 = i0;
    for (/** @type {number} */ var b = 0; b < Math.max(1, extents[1]); ++b) {
      /** @type {number} */
      var i2 = i1;
      for (/** @type {number} */ var c = 0; c < Math.max(1, extents[2]); ++c) {
        /** @type {number} */
        var v;
        switch (c) {
          case 0: v = a * max / Math.max(1, extents[0]); break;
          case 1: v = b * max / Math.max(1, extents[1]); break;
          case 2: v = (Math.atan2(b, a) + seed) * max / Math.PI; break;
          default: v = max; break;
        }
        /** @type {number} */
        var i3 = i2;
        for (var d = 0; d < Math.max(1, extents[3]); ++d) {
          buffer[i3] = v;
          i3 += stride[3];
        }
        i2 += stride[2];
      }
      i1 += stride[1];
    }
    i0 += stride[0];
  }
};


/**
 * Given an Argument and side length, create and return a new BufferArgument
 * with a comparible Buffer. The data should vary based on 'seed', so that
 * calls for multiple Arguments will not be identical.
 *
 * @param {!safelight.Argument} argument type data for buffer.
 * @param {number} w buffer width.
 * @param {number} h buffer height.
 * @param {number} seed random number seed.
 * @return {!safelight.Buffer} buffer.
 */
safelight.DefaultInputValues.prototype.makeInputBuffer = function(argument,
                                                                  w,
                                                                  h,
                                                                  seed) {
  /** @type {!safelight.Buffer} */
  var b = new safelight.Buffer();

  b.elem_size = argument.type_bits / 8;
  b.type_code = argument.type_code;
  b.dimensions = argument.dimensions;

  b.extent[0] = w;
  b.extent[1] = h;
  b.extent[2] = 4;
  b.extent[3] = 1;
  for (var i = argument.dimensions; i < 4; ++i) {
    b.extent[i] = 0;
  }

  /** @type {number} */
  var storage = b.elem_size;
  for (var i = 0; i < argument.dimensions; ++i) {
    storage *= b.extent[i];
    // This always constructs a planar image; it would be
    // nice if we could use a chunky layout for filters that use that,
    // to avoid needing to convert elsewhere.
    b.stride[i] = (i == 0) ? 1 : b.stride[i - 1] * b.extent[i - 1];
  }

  b.host = new ArrayBuffer(storage);
  switch (argument.type_code + argument.type_bits) {
      case 'uint8':
        this.fillBuffer_(new Uint8Array(b.host), 0xff, b.extent, b.stride,
            seed);
        break;
      case 'uint16':
        this.fillBuffer_(new Uint16Array(b.host), 0xffff, b.extent, b.stride,
            seed);
        break;
      case 'uint32':
        this.fillBuffer_(new Uint32Array(b.host), 0xffffffff, b.extent,
            b.stride, seed);
        break;
      case 'uint8':
        this.fillBuffer_(new Int8Array(b.host), 0xff, b.extent, b.stride, seed);
        break;
      case 'uint16':
        this.fillBuffer_(new Int16Array(b.host), 0xff, b.extent, b.stride,
            seed);
        break;
      case 'uint32':
        this.fillBuffer_(new Int32Array(b.host), 0xff, b.extent, b.stride,
            seed);
        break;
      case 'float32':
        this.fillBuffer_(new Float32Array(b.host), 1.0, b.extent, b.stride,
            seed);
        break;
      case 'float64':
        this.fillBuffer_(new Float64Array(b.host), 1.0, b.extent, b.stride,
            seed);
        break;
  }
  return b;
};


/** @const {!angular.Module} */
safelight.defaultInputValues.module =
    angular.module('safelight.defaultInputValues.module', [])
    .service('defaultInputValues', safelight.DefaultInputValues);
