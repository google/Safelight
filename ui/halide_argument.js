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
goog.provide('safelight.Argument');
goog.provide('safelight.ArgumentKind');

/**
 * Enum for Argument.kind.
 * @enum {number}
 */
safelight.ArgumentKind = {
  SCALAR: 0,
  INPUT_BUFFER: 1,
  OUTPUT_BUFFER: 2
};

/**
 * Enum for Argument.type_code.
 * @enum {string}
 */
safelight.ArgumentTypeCode = {
  UINT: 'uint',
  INT: 'int',
  FLOAT: 'float',
  HANDLE: 'handle'
};

/**
 * Argument is a strongly-typed JS wrapper for the Halide Argument struct.
 *
 * @struct @constructor @final
 */
safelight.Argument = function() {
  /** @export @type {string} */
  this.name = '';

  /** @export @type {safelight.ArgumentKind} */
  this.kind = safelight.ArgumentKind.SCALAR;

  /** @export @type {number} */
  this.dimensions = 0;

  /** @export @type {safelight.ArgumentTypeCode} */
  this.type_code = safelight.ArgumentTypeCode.UINT;

  /** @export @type {number} */
  this.type_bits = 8;

  /** @export @type {Object|undefined} */
  this.def = undefined;

  /** @export @type {Object|undefined} */
  this.min = undefined;

  /** @export @type {Object|undefined} */
  this.max = undefined;
};

/**
 * A convenience function to convert from a loosely-typed Object
 * (provided by PackagedCall wrappers) into our strongly typed Argument struct.
 *
 * @param {Object} dict Optional dictionary from which to initialize
 * @return {!safelight.Argument} the strongly-typed result.
 */
safelight.Argument.fromDict = function(dict) {
  /** @type {!safelight.Argument} */
  var argument = new safelight.Argument();
  argument.name = dict['name'];
  argument.kind = dict['kind'];
  // Ensure scalars get a numeric value (zero) if this is missing.
  argument.dimensions = dict['dimensions'] || 0;
  argument.type_code = dict['type_code'];
  argument.type_bits = dict['type_bits'];
  argument.def = dict['def'];
  argument.min = dict['min'];
  argument.max = dict['max'];
  return argument;
};

/**
 * A convenience function to determine if the Argument is a buffer (vs scalar).
 *
 * @return {boolean} true iff the Argument kind is a buffer.
 */
safelight.Argument.prototype.isBuffer = function() {
  return this.kind == safelight.ArgumentKind.INPUT_BUFFER ||
      this.kind == safelight.ArgumentKind.OUTPUT_BUFFER;
};

/**
 * A convenience function to determine if the Argument is input (vs output)
 *
 * @return {boolean} true iff the Argument kind is input.
 */
safelight.Argument.prototype.isInput = function() {
  return this.kind == safelight.ArgumentKind.INPUT_BUFFER ||
      this.kind == safelight.ArgumentKind.SCALAR;
};
