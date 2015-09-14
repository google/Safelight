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

package main

import (
	"crypto/sha256"
	"encoding/hex"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"safelight"
	"strings"
	"time"
)

// Flags
var (
	tempDir         = flag.String("tempDir", os.TempDir(), "Directory for temporary .nexe")
	htmlIndex       = flag.String("htmlIndex", "safelight/ui/index.html", "HTML Index file")
	port            = flag.Int("port", 6502, "port for http")
	cacheSize       = flag.Int("cacheSize", 32, "Size for LRU cache")
	timeout         = flag.Duration("timeout", 5*60*time.Second, "timeout for building + running generator")
	prebuiltNexeDir = flag.String("prebuiltNexeDir", os.TempDir()+"/safelightPrebuiltNexeDir", "prebuilt nexe dir")
)

// Misc globals
var (
	nexeAppBuilder safelight.AppBuilder
	filterCache    safelight.FilterCache
	logChan        chan string
	logText        string
)

var filterCachePath = regexp.MustCompile("^/safelight_([0-9a-f]+)_(arm-32[^.]*|x86-32[^.]*|x86-64[^.]*).(nexe|s|stmt|html|nmf)$")
var runfilesContentPath = regexp.MustCompile("^/([0-9a-zA-Z_/.-]+).(css|js|html|nexe)$")
var extToContentType = map[string]string{
	".css":  "text/css",
	".html": "text/html",
	".js":   "application/javascript",
	".nexe": "application/x-nacl",
}
var prebuiltWhitelist = map[string]bool{}

// serveFile returns writes a file from the user's file system to the ResponseWriter.
// There are three types of pathnames that may be received.
//   1) An absolute path (e.g. /tmp/output/safelight_example.nexe)
//   2) A relative path from outside the safelight directory (e.g. safelight/ui/index.html)
//   3) A relative path from within safelight/ui (e.g. components/alerter/aleter.js)
// This function attempts to open files with name pathname in the order mentioned above and returns an
// error if all fail.
func serveFile(pathname string, w http.ResponseWriter) error {
	fmt.Printf("\nAttempting to serve %s via absolute...:\n", pathname)
	f, err := os.Open(pathname)
	if err != nil {
		// Search for a relative path from outside the safelight directory
		fmt.Printf("file.Open fails: %v %v...\nAttempting to serve relative to outside safelight...\n", pathname, err)
		safelightDir := os.Getenv("SAFELIGHT_DIR") + "/../"
		pathnameRelToSafelight := safelightDir + pathname
		f, err = os.Open(pathnameRelToSafelight)
		if err != nil {
			fmt.Printf("file.Open fails: %v %v...\nAttempting to serve relative to safelight/ui\n", pathnameRelToSafelight, err)
			// If relative path doesn't work, it must be a partial template
			pathnameRelToUI := os.Getenv("SAFELIGHT_DIR") + "/ui" + pathname
			f, err = os.Open(pathnameRelToUI)
			if err != nil {
				fmt.Printf("file.Open completely fails: %v %v\n", pathnameRelToUI, err)
				return err
			}
		}
	}

	defer f.Close()
	ext := filepath.Ext(pathname)
	if contentType, ok := extToContentType[ext]; ok {
		w.Header().Set("Content-Type", contentType)
		fmt.Printf("Content-Type %s -> %s", pathname, contentType)
	}
	_, err = io.Copy(w, f)
	if err != nil {
		return err
	}
	fmt.Printf("serveFile: %v", pathname)
	return nil
}

// Serve an arbitrary file; only files listed in prebuiltWhitelist are allowed
func servePrebuiltFile(pathname string, w http.ResponseWriter) error {
	if !prebuiltWhitelist[pathname] {
		return fmt.Errorf("non whitelisted file: %v", pathname)
	}
	f, err := os.Open(pathname)
	if err != nil {
		fmt.Printf("runfiles.Open fails: %v %v", pathname, err)
		return err
	}
	defer f.Close()
	ext := filepath.Ext(pathname)
	if contentType, ok := extToContentType[ext]; ok {
		w.Header().Set("Content-Type", contentType)
		fmt.Printf("Content-Type %s -> %s", pathname, contentType)
	}
	_, err = io.Copy(w, f)
	if err != nil {
		return err
	}
	fmt.Printf("serveFile: %v", pathname)
	return nil
}

// Calculate the SHA256 and return as hexadecimal string.
func hashOf(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

func oneString(s []string) string {
	if s == nil || len(s) != 1 {
		return ""
	}
	return s[0]
}

func buildFilter(builder safelight.AppBuilder, functionName, pathToGen, target string) (*safelight.FilterInfo, error) {
	sigSource := fmt.Sprintf("%s/%s", functionName, pathToGen)
	signature := hashOf([]byte(sigSource))
	fmt.Printf("Signature: %v\n", signature)

	filterInfo := filterCache.Get(signature, target)
	if filterInfo == nil {
		var err error
		filterInfo, err = builder.Build(functionName, pathToGen, signature, target)
		if err != nil {
			return nil, err
		}
		filterCache.Add(filterInfo)
	}
	return filterInfo, nil
}

func handler(w http.ResponseWriter, r *http.Request) {
	fmt.Printf("Path: %v", r.URL.Path)
	if r.Method == "GET" {
		switch r.URL.Path {
		case "/":
			err := serveFile(*htmlIndex, w)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

		case "/buildlog":
			_, err := w.Write([]byte(logText))
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

		case "/nacl_sniffer.nmf":
			nmf := `{"files":{},"program":{`
			sep := ""
			for _, cpu := range []string{"x86-64", "x86-32", "arm"} {
				cpuUnderscore := strings.Replace(cpu, "-", "_", -1)
				nmf += fmt.Sprintf(`%s"%s":{"url":"%s/%s/nacl_sniffer.nexe"}`, sep, cpu, *prebuiltNexeDir, cpuUnderscore)
				sep = ","
			}
			nmf += `}}`
			_, err := w.Write([]byte(nmf))
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}

		case "/visualizers.nmf":
			nmf := `{"files":{},"program":{`
			sep := ""
			for _, cpu := range []string{"x86-64", "x86-32", "arm"} {
				cpuUnderscore := strings.Replace(cpu, "-", "_", -1)
				nmf += fmt.Sprintf(`%s"%s":{"url":"%s/%s/visualizers_shell.nexe"}`, sep, cpu, *prebuiltNexeDir, cpuUnderscore)
				sep = ","
			}
			nmf += `}}`
			_, err := w.Write([]byte(nmf))
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}

		default:
			if prebuiltWhitelist[r.URL.Path] {
				fmt.Printf("Attempting to serve prebuilt %v\n", r.URL.Path)
				err := servePrebuiltFile(r.URL.Path, w)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				return
			}

			m := filterCachePath.FindStringSubmatch(r.URL.Path)
			if m != nil {
				signature := m[1]
				target := m[2]
				ext := m[3]
				filterInfo := filterCache.Get(signature, target)
				if filterInfo != nil {
					if info := filterInfo.Info[ext]; info != nil {
						if _, err := w.Write(info); err != nil {
							http.Error(w, err.Error(), http.StatusInternalServerError)
							return
						}
					}
				}
				return
			}

			m = runfilesContentPath.FindStringSubmatch(r.URL.Path)
			if m != nil {
				err := serveFile(r.URL.Path, w)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				return
			}

			http.NotFound(w, r)
		}
	} else if r.Method == "POST" {
		logText = ""
		values := r.URL.Query()

		switch r.URL.Path {
		case "/build":
			{
				target := oneString(values["target"])
				pathToGen := oneString(values["pathToGen"])
				functionName := oneString(values["functionName"])
				fmt.Printf("Target = %s, pathToGen = %s, functionName = %s", target, pathToGen, functionName)
				var appBuilder safelight.AppBuilder
				if strings.Contains(target, "nacl") {
					appBuilder = nexeAppBuilder
				} else {
					http.Error(w, "Unsupported target", http.StatusInternalServerError)
					return
				}
				info, err := buildFilter(appBuilder, functionName, pathToGen, target)
				if err != nil {
					fmt.Printf("Error after buildFilter: %s\n", err)
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				_, err = w.Write([]byte(info.Signature))
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				w.Header().Set("Content-Type", "text/plain")
				return
			}
		default:
			http.NotFound(w, r)
			return
		}
	}
}

// addHandler registers handler h at the specified path.
func addHandler(path string, h http.Handler) {
	// wrap in handler to set (and later clear) basic request-scoped data
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Println("About to serve")
		h.ServeHTTP(w, r)
	})
	http.Handle(path, handler)
}

func main() {

	if *prebuiltNexeDir == "" {
		fmt.Println("--prebuiltNexeDir must be specified")
	}

	// Whitelist the prebuilt files we might need to serve
	for _, cpu := range []string{"x86_64", "x86_32", "arm"} {
		prebuiltWhitelist[fmt.Sprintf("%s/%s/nacl_sniffer.nexe", *prebuiltNexeDir, cpu)] = true
		prebuiltWhitelist[fmt.Sprintf("%s/%s/visualizers_shell.nexe", *prebuiltNexeDir, cpu)] = true
	}

	fmt.Printf("port = %v\n", *port)

	// Listener that picks up logText updates(from appbuilder)
	logChan = make(chan string)
	go func(logChan chan string) {
		for {
			newupdate := <-logChan
			logText += newupdate
		}
	}(logChan)
	var err error
	nexeAppBuilder, err = safelight.NewNexeAppBuilder(*tempDir, logChan, *timeout)
	if err != nil {
		fmt.Println(err)
	}

	filterCache, err = safelight.NewFilterCache(*cacheSize)
	if err != nil {
		fmt.Println(err)
	}

	addHandler("/", http.HandlerFunc(handler))

	name, err := os.Hostname()
	if err != nil {
		fmt.Println(err)
	}

	msg := fmt.Sprintf(`

************************************
Safelight is running on http://%s:%d
************************************

`, name, *port)

	fmt.Print(msg)

	http.ListenAndServe(fmt.Sprintf(":%d", *port), nil)

	// Normally never returns, so any result is fatal
	fmt.Println("SAFELIGHT SERVER ERROR")
}
