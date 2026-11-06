(function () {
    'use strict';

    class MusicRandomPlugin {
        constructor({ playbackManager, loading, toast, ServerConnections }) {
            this.name = 'Music Random Tab Plugin';
            this.type = 'skin';
            this.id = 'musicRandomPlugin';
            this.playbackManager = playbackManager;
            this.loading = loading;
            this.toast = toast;
            this.ServerConnections = ServerConnections;
            this.isRandomActive = false;

            this.init();
        }

        init() {
            this.injectStyles();
            const observer = new MutationObserver(() => this.ensureRandomTab());
            observer.observe(document.body, { childList: true, subtree: true });

            window.addEventListener('hashchange', () => {
                if (!this.isMusicPage()) {
                    this.hideRandomView();
                } else {
                    this.ensureRandomTab();
                }
            });
            this.ensureRandomTab();
        }

        injectStyles() {
            if (!document.getElementById('plugin-music-random-styles')) {
                const style = document.createElement('style');
                style.id = 'plugin-music-random-styles';
                style.textContent = `
                    body.plugin-music-random-active #musicPage > *:not(#plugin-music-random-panel) {
                        display: none !important;
                    }
                    .plugin-random-toolbar-btn.active {
                        background: rgba(0, 164, 220, 0.25) !important;
                        color: #00a4dc !important;
                        border-color: #00a4dc !important;
                    }
                    #pluginRandomGrid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
                        gap: 18px;
                    }
                    @media (max-width: 600px) {
                        #plugin-music-random-panel {
                            padding: 12px 12px 90px !important;
                        }
                        #pluginRandomGrid {
                            grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
                            gap: 12px;
                        }
                    }
                `;
                document.head.appendChild(style);
            }
        }

        isMusicPage() {
            const hash = (window.location.hash || '').toLowerCase();
            return hash.startsWith('#/music') || !!document.getElementById('musicPage');
        }

        getTopParentIdFromHash() {
            const hash = window.location.hash || '';
            const qIdx = hash.indexOf('?');
            if (qIdx === -1) return null;
            const params = new URLSearchParams(hash.substring(qIdx + 1));
            return params.get('topParentId') || params.get('parentId');
        }

        ensureRandomTab() {
            if (!this.isMusicPage()) return;

            // 1. Modern React UI: LibraryViewMenu dropdown (#library-view-menu) + Toolbar quick button
            const menuBtn = document.querySelector('button[aria-controls="library-view-menu"]');
            if (menuBtn && menuBtn.parentElement && !menuBtn.parentElement.querySelector('.plugin-random-toolbar-btn')) {
                const quickBtn = document.createElement('button');
                quickBtn.type = 'button';
                quickBtn.className = 'MuiButtonBase-root MuiButton-root MuiButton-outlined MuiButton-outlinedInherit MuiButton-sizeSmall plugin-random-toolbar-btn';
                quickBtn.style.cssText = 'margin-left:10px;padding:4px 12px;border-radius:16px;border:1px solid rgba(255,255,255,0.3);background:transparent;color:inherit;cursor:pointer;font-size:0.85rem;font-weight:600;display:inline-flex;align-items:center;gap:4px;';
                quickBtn.innerHTML = '<span class="material-icons casino" style="font-size:1.1rem;"></span> Random';
                quickBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.isRandomActive) {
                        this.hideRandomView();
                    } else {
                        this.showRandomView();
                    }
                });
                menuBtn.insertAdjacentElement('afterend', quickBtn);
            }

            const menuList = document.querySelector('#library-view-menu ul.MuiMenu-list');
            if (menuList && !menuList.querySelector('.plugin-random-menu-item')) {
                const items = Array.from(menuList.querySelectorAll('li[role="menuitem"]'));
                if (!items.some(i => i.textContent.trim().toLowerCase() === 'random')) {
                    const refItem = items[1] || items[0];
                    if (refItem) {
                        const li = document.createElement('li');
                        li.className = refItem.className.replace('Mui-selected', '') + ' plugin-random-menu-item';
                        li.setAttribute('role', 'menuitem');
                        li.tabIndex = -1;
                        li.textContent = 'Random';
                        li.addEventListener('click', () => {
                            // Close MUI backdrop if open
                            const backdrop = document.querySelector('#library-view-menu .MuiBackdrop-root');
                            if (backdrop) backdrop.click();
                            this.showRandomView();
                        });
                        items.forEach(item => {
                            item.addEventListener('click', () => this.hideRandomView());
                        });
                        refItem.insertAdjacentElement('afterend', li);
                    }
                }
            }

            // 2. Legacy UI (.emby-tabs-slider)
            const legacyTabs = document.querySelector('.emby-tabs-slider');
            if (legacyTabs && !legacyTabs.querySelector('.plugin-random-tab-btn')) {
                const existingBtns = Array.from(legacyTabs.querySelectorAll('.emby-tab-button'));
                if (!existingBtns.some(b => b.textContent.trim().toLowerCase() === 'random')) {
                    const refBtn = existingBtns[1] || existingBtns[0];
                    if (refBtn) {
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.setAttribute('is', 'emby-button');
                        btn.className = 'emby-tab-button emby-button plugin-random-tab-btn';
                        btn.innerHTML = '<div class="emby-button-foreground">Random</div>';
                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.showRandomView();
                        });
                        existingBtns.forEach(t => {
                            t.addEventListener('click', () => this.hideRandomView());
                        });
                        refBtn.insertAdjacentElement('afterend', btn);
                    }
                }
            }
        }

        async showRandomView() {
            const apiClient = this.ServerConnections.currentApiClient();
            if (!apiClient) return;

            this.isRandomActive = true;
            document.body.classList.add('plugin-music-random-active');
            document.querySelectorAll('.plugin-random-toolbar-btn').forEach(b => b.classList.add('active'));

            const topParentId = this.getTopParentIdFromHash();
            const host = document.getElementById('musicPage') || document.querySelector('.mainAnimatedPages') || document.body;

            let panel = document.getElementById('plugin-music-random-panel');
            if (!panel || panel.parentElement !== host) {
                if (panel) panel.remove();
                panel = document.createElement('div');
                panel.id = 'plugin-music-random-panel';
                panel.style.cssText = 'padding:16px 3% 90px;min-height:80vh;box-sizing:border-box;';
                host.appendChild(panel);
            }
            panel.style.display = 'block';
            panel.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <h2 style="margin:0;">Random Albums</h2>
                    </div>
                    <div style="display:flex;gap:10px;">
                        <button id="pluginRandomRefreshBtn" class="raised button-submit emby-button" style="padding:8px 16px;cursor:pointer;border-radius:4px;border:none;background:#00a4dc;color:#fff;display:inline-flex;align-items:center;gap:6px;">
                            <span class="material-icons refresh" style="font-size:1.2rem;"></span> Re-Roll Random
                        </button>
                        <button id="pluginRandomShuffleAllBtn" class="raised emby-button" style="padding:8px 16px;cursor:pointer;border-radius:4px;border:none;background:#333;color:#fff;display:inline-flex;align-items:center;gap:6px;">
                            <span class="material-icons shuffle" style="font-size:1.2rem;"></span> Shuffle Library
                        </button>
                        <button id="pluginRandomCloseBtn" class="raised emby-button" style="padding:8px 16px;cursor:pointer;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#fff;display:inline-flex;align-items:center;gap:6px;">
                            <span class="material-icons close" style="font-size:1.2rem;"></span> Back to Albums
                        </button>
                    </div>
                </div>
                <div id="pluginRandomGrid"></div>
            `;

            panel.querySelector('#pluginRandomRefreshBtn').addEventListener('click', () => this.showRandomView());
            panel.querySelector('#pluginRandomCloseBtn').addEventListener('click', () => this.hideRandomView());
            panel.querySelector('#pluginRandomShuffleAllBtn').addEventListener('click', async () => {
                if (topParentId) {
                    const libItem = await apiClient.getItem(apiClient.getCurrentUserId(), topParentId);
                    this.playbackManager.shuffle(libItem);
                }
            });

            if (this.loading) this.loading.show();
            try {
                const query = {
                    SortBy: 'Random,SortName',
                    IncludeItemTypes: 'MusicAlbum',
                    Recursive: true,
                    Fields: 'PrimaryImageAspectRatio,SortName',
                    ImageTypeLimit: 1,
                    EnableImageTypes: 'Primary,Backdrop,Banner,Thumb',
                    Limit: 100
                };
                if (topParentId) query.ParentId = topParentId;

                const result = await apiClient.getItems(apiClient.getCurrentUserId(), query);
                const grid = panel.querySelector('#pluginRandomGrid');
                const serverId = apiClient.serverId();

                grid.innerHTML = (result.Items || []).map(album => {
                    const imgUrl = album.ImageTags?.Primary
                        ? apiClient.getUrl(`Items/${album.Id}/Images/Primary`, { tag: album.ImageTags.Primary, maxWidth: 360, quality: 90 })
                        : '';
                    const title = (album.Name || '').replace(/</g, '&lt;');
                    const artist = (album.AlbumArtist || '').replace(/</g, '&lt;');
                    return `
                        <div class="plugin-random-card" data-id="${album.Id}" style="background:#1c1c1e;border-radius:8px;overflow:hidden;cursor:pointer;display:flex;flex-direction:column;transition:transform 0.15s;">
                            <div style="position:relative;width:100%;aspect-ratio:1/1;background:#2a2a2d;background-image:url('${imgUrl}');background-size:cover;background-position:center;">
                                <button class="plugin-random-play" data-id="${album.Id}" title="Play Album"
                                    style="position:absolute;bottom:8px;right:8px;width:40px;height:40px;border-radius:50%;border:none;background:#00a4dc;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.6);">
                                    <span class="material-icons play_arrow"></span>
                                </button>
                            </div>
                            <div style="padding:10px;">
                                <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;">${title}</div>
                                <div style="font-size:0.85em;opacity:0.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#ccc;margin-top:2px;">${artist}</div>
                            </div>
                        </div>
                    `;
                }).join('');

                grid.querySelectorAll('.plugin-random-card').forEach(card => {
                    card.addEventListener('click', (e) => {
                        if (e.target.closest('.plugin-random-play')) return;
                        const id = card.getAttribute('data-id');
                        this.hideRandomView();
                        window.location.hash = `#/details?id=${id}&serverId=${serverId}`;
                    });
                });
                grid.querySelectorAll('.plugin-random-play').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const id = btn.getAttribute('data-id');
                        this.playbackManager.play({ ids: [id], serverId: serverId });
                    });
                });
            } catch (err) {
                console.error('[MusicRandomPlugin] Failed to load random albums', err);
            } finally {
                if (this.loading) this.loading.hide();
            }
        }

        hideRandomView() {
            this.isRandomActive = false;
            document.body.classList.remove('plugin-music-random-active');
            document.querySelectorAll('.plugin-random-toolbar-btn').forEach(b => b.classList.remove('active'));
            const panel = document.getElementById('plugin-music-random-panel');
            if (panel) panel.style.display = 'none';
        }
    }

    window.musicRandomPlugin = async () => MusicRandomPlugin;
})();
