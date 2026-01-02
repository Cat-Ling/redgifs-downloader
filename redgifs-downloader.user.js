// ==UserScript==
// @name         Redgifs Downloader
// @namespace    https://github.com/serpapps/redgifs-downloader
// @version      1.0.3
// @description  A userscript to download GIFs and videos from RedGifs.com
// @author       SERP Apps
// @match        *://*.redgifs.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.redgifs.com
// @connect      thumbs2.redgifs.com
// @connect      media.redgifs.com
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    console.log('Redgifs Downloader: Script started');

    const API_BASE = 'https://api.redgifs.com/v2';
    let cachedToken = null;

    // --- API Functions ---

    async function getTemporaryToken() {
        if (cachedToken) return cachedToken;

        // Try to get from storage first
        const storedToken = GM_getValue('redgifs_token', null);
        const storedTokenTime = GM_getValue('redgifs_token_time', 0);
        const now = Date.now();

        // Token valid for 1 hour
        if (storedToken && (now - storedTokenTime < 3600 * 1000)) {
            cachedToken = storedToken;
            return storedToken;
        }

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: `${API_BASE}/auth/temporary`,
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.token) {
                            cachedToken = data.token;
                            GM_setValue('redgifs_token', cachedToken);
                            GM_setValue('redgifs_token_time', Date.now());
                            resolve(cachedToken);
                        } else {
                            reject('No token in response');
                        }
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: reject
            });
        });
    }

    async function getGifInfo(id) {
        const token = await getTemporaryToken();
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: `${API_BASE}/gifs/${id}`,
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.gif) {
                            resolve(data.gif);
                        } else {
                            reject('GIF data not found');
                        }
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: reject
            });
        });
    }

    // --- Download Logic ---

    async function downloadMedia(id, btnElement) {
        try {
            if (btnElement) {
                btnElement.textContent = '...';
                btnElement.disabled = true;
            }

            const gifData = await getGifInfo(id);

            // Prioritize HD, then SD
            let url = gifData.urls.hd || gifData.urls.sd;
            if (!url) {
                throw new Error('No suitable video URL found');
            }

            const filename = `${id}.mp4`;

            if (typeof GM_download === 'function') {
                GM_download({
                    url: url,
                    name: filename,
                    onload: () => {
                        if (btnElement) {
                            btnElement.textContent = 'Done';
                            setTimeout(() => { btnElement.textContent = 'Download'; btnElement.disabled = false; }, 2000);
                        }
                    },
                    onerror: (err) => {
                        console.error('Redgifs Downloader: Download failed', err);
                        if (btnElement) {
                            btnElement.textContent = 'Error';
                            setTimeout(() => { btnElement.textContent = 'Download'; btnElement.disabled = false; }, 2000);
                        }
                    }
                });
            } else {
                // Fallback implementation using Blob
                 GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    responseType: 'blob',
                    onload: function(response) {
                        const blob = response.response;
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = filename;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        if (btnElement) {
                            btnElement.textContent = 'Done';
                            setTimeout(() => { btnElement.textContent = 'Download'; btnElement.disabled = false; }, 2000);
                        }
                    },
                    onerror: function(err) {
                        console.error('Redgifs Downloader: Download failed', err);
                         if (btnElement) {
                            btnElement.textContent = 'Error';
                            setTimeout(() => { btnElement.textContent = 'Download'; btnElement.disabled = false; }, 2000);
                        }
                    }
                });
            }

        } catch (error) {
            console.error('Redgifs Downloader: Error downloading:', error);
            if (btnElement) {
                btnElement.textContent = 'Error';
                 setTimeout(() => { btnElement.textContent = 'Download'; btnElement.disabled = false; }, 2000);
            }
            alert(`Redgifs Downloader: Failed to download: ${error.message}`);
        }
    }

    // --- UI Injection ---

    function createDownloadButton(id, isSmall = false) {
        const btnId = `rg-dl-btn-${id}`;
        // We do not check for existence by ID here because we might have multiple players
        // and we want a new button instance for the specific container.
        // The calling function handles uniqueness per container.

        const btn = document.createElement('button');
        btn.id = btnId;
        btn.textContent = 'Download';
        btn.style.position = 'absolute';
        btn.style.zIndex = '2147483647'; // Max Int to be on top of everything
        btn.style.backgroundColor = '#e31010';
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '4px';
        btn.style.cursor = 'pointer';
        btn.style.fontFamily = 'sans-serif';
        btn.style.fontWeight = 'bold';
        btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.5)';

        if (isSmall) {
             btn.style.top = '5px';
             btn.style.right = '5px';
             btn.style.padding = '4px 8px';
             btn.style.fontSize = '10px';
        } else {
             // For watch page
             btn.style.top = '20px';
             btn.style.right = '20px';
             btn.style.padding = '10px 15px';
             btn.style.fontSize = '14px';
        }

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            downloadMedia(id, btn);
        });

        return btn;
    }

    function processFeedVideos() {
        // Find all potential player containers.
        // Based on analysis, .Player is the main wrapper.
        const players = document.querySelectorAll('.Player');

        players.forEach(player => {
             // Check if we already injected a button into THIS player instance
             if (player.querySelector('button[id^="rg-dl-btn-"]')) return;

             let id = null;

             // Strategy 1: Look for data-feed-item-id on closest parent
             // This is the most reliable way as seen in the HTML dump
             const wrapper = player.closest('[data-feed-item-id]');
             if (wrapper) {
                 id = wrapper.getAttribute('data-feed-item-id');
             }

             // Strategy 2: Fallback to video src/poster parsing
             if (!id) {
                 const video = player.querySelector('video');
                 if (video) {
                     const src = video.src || '';
                     const poster = video.getAttribute('poster') || '';
                     // Common pattern: /gifs/<id>/... or just <id> in filename
                     // Example: https://api.redgifs.com/v2/gifs/anxiouszigzagelk/hd.m3u8
                     const match = src.match(/\/gifs\/([a-zA-Z0-9]+)/) || poster.match(/\/([a-zA-Z0-9]+)-mobile\.jpg/);
                     if (match) {
                         id = match[1];
                     }
                 }
             }

             if (id) {
                 // Ensure container is positioned
                 if (getComputedStyle(player).position === 'static') {
                     player.style.position = 'relative';
                 }
                 const btn = createDownloadButton(id, false);
                 player.appendChild(btn);
             }
        });
    }

    function processGridItems() {
        // Look for links to /watch/<id>
        const links = document.querySelectorAll('a[href*="/watch/"]');
        links.forEach(link => {
            const href = link.getAttribute('href');
            const match = href.match(/\/watch\/([^\/?#]+)/);
            if (match) {
                const id = match[1];
                // Only process if it looks like a grid item (has image or video child)
                if (link.querySelector('img') || link.querySelector('video')) {
                     // Ensure position relative
                     if (getComputedStyle(link).position === 'static') {
                        link.style.position = 'relative';
                     }

                     // Avoid duplicates
                     if (!link.querySelector(`#rg-dl-btn-${id}`)) {
                         const btn = createDownloadButton(id, true);
                         if (btn) link.appendChild(btn);
                     }
                }
            }
        });
    }

    function run() {
        try {
            processFeedVideos();
            processGridItems();
        } catch (e) {
            console.error('Redgifs Downloader: Error in run loop', e);
        }
    }

    // --- Observer ---

    let timeout = null;
    const observer = new MutationObserver(() => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(run, 500);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initial run
    run();

})();
