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

package safelight

import (
	"github.com/golang/groupcache/lru"
	"sync"
)

// FilterInfo is a simple key-value map
type FilterInfo struct {
	Signature string
	Target    string
	Info      map[string][]byte
}

// FilterCache is an interface
type FilterCache interface {
	Add(filter *FilterInfo)
	Get(signature, target string) *FilterInfo
}

type filterCache struct {
	cache *lru.Cache
	lock  sync.Mutex
}

// NewFilterCache creates a new cache
func NewFilterCache(maxEntries int) (FilterCache, error) {
	n := &filterCache{
		cache: lru.New(maxEntries),
	}
	return n, nil
}

func (n *filterCache) Add(filter *FilterInfo) {
	n.lock.Lock()
	defer n.lock.Unlock()
	key := filter.Signature + "_" + filter.Target
	n.cache.Add(key, filter)
}

func (n *filterCache) Get(signature, target string) *FilterInfo {
	n.lock.Lock()
	defer n.lock.Unlock()
	key := signature + "_" + target
	filter, ok := n.cache.Get(key)
	if ok {
		return filter.(*FilterInfo)
	}
	return nil
}
