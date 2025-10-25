        };
        
        function updateCornerPositions() {
            const rect = canvasWrapper.getBoundingClientRect();
            cornerPositions.nw = { x: rect.left, y: rect.top };
            cornerPositions.ne = { x: rect.right, y: rect.top };
            cornerPositions.se = { x: rect.right, y: rect.bottom };
            cornerPositions.sw = { x: rect.left, y: rect.bottom };
        }
        
        document.querySelectorAll('.corner-lock').forEach(lock => {
            lock.addEventListener('click', (e) => {
                e.stopPropagation();
                const corner = lock.dataset.corner;
                
                // Unlock all other corners first
                for (let c in lockedCorners) {
                    if (c !== corner) {
                        lockedCorners[c] = false;
                        const otherLock = document.querySelector(`.corner-lock[data-corner="${c}"]`);
                        if (otherLock) {
                            otherLock.classList.remove('locked');
                            otherLock.textContent = '🔓';
                        }
                    }
                }
                
                lockedCorners[corner] = !lockedCorners[corner];
                
                if (lockedCorners[corner]) {
                    lock.classList.add('locked');
                    lock.textContent = '🔒';
                    lock.title = `Unlock ${corner.replace('n', 'top-').replace('s', 'bottom-').replace('w', 'left').replace('e', 'right')} corner`;
                    updateCornerPositions();
                } else {
                    lock.classList.remove('locked');
                    lock.textContent = '🔓';
                    lock.title = `Lock ${corner.replace('n', 'top-').replace('s', 'bottom-').replace('w', 'left').replace('e', 'right')} corner`;
                }
            });
        });

        // Show/Hide canvas border & handles
        function applyHandlesVisibility(show) {
            document.querySelectorAll('.resize-handle, .corner-lock').forEach(el => {
                if (el) el.style.display = show ? '' : 'none';
            });
            if (!show) {
                sizeDisplay.style.opacity = '0';
                sizeDisplay.style.display = 'none';
            } else {
                sizeDisplay.style.display = '';
            }
        }
        if (showCanvasHandles) {
            applyHandlesVisibility(showCanvasHandles.checked);
            showCanvasHandles.addEventListener('change', (e) => {
                applyHandlesVisibility(e.target.checked);
            });
        }

        // Lock/unlock canvas borders
        if (lockCanvasBorders) {
            lockCanvasBorders.addEventListener('change', (e) => {
                bordersLocked = e.target.checked;
            });
        }
        
        // Resize functionality
        let isResizing = false;
        let resizeDirection = null;
        let startX, startY, startWidth, startHeight, startLeft, startTop;
        let lockedCornerPos = null;
        let autoLockedCorner = null; // temporary anchor during corner drags
        
        document.querySelectorAll('.resize-handle').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (bordersLocked) return;
                if (typeof pushUndo === 'function') pushUndo();
                isResizing = true;
                {
                    const dirClass = Array.from(handle.classList).find(c => /^resize-(n|s|e|w|nw|ne|se|sw)$/.test(c));
                    resizeDirection = dirClass ? dirClass.replace('resize-', '') : '';
                }
                startX = e.clientX;
                startY = e.clientY;
                
                // Get current position and size
                const rect = canvasWrapper.getBoundingClientRect();
                const areaRect = canvasArea.getBoundingClientRect();
                
                // Store starting values from actual rendered position
                startLeft = rect.left - areaRect.left;
                startTop = rect.top - areaRect.top;
                startWidth = rect.width;
                startHeight = rect.height;
                
                sizeDisplay.style.opacity = '1';
                
                // Auto-anchor opposite corner for corner drags if no explicit lock is set
                const cornerOpp = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' };
                const hasExplicitLock = Object.values(lockedCorners).some(v => v);
                autoLockedCorner = null;
                if (!hasExplicitLock && cornerOpp[resizeDirection]) {
                    autoLockedCorner = cornerOpp[resizeDirection];
                }

                // Capture locked corner position if any corner is locked (explicit or auto)
                updateCornerPositions();
                lockedCornerPos = null;
                if (autoLockedCorner) {
                    lockedCornerPos = { ...cornerPositions[autoLockedCorner] };
                } else {
                    for (let corner in lockedCorners) {
                        if (lockedCorners[corner]) {
                            lockedCornerPos = { ...cornerPositions[corner] };
                            break;
                        }
                    }
                }
            });
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            let newWidth = startWidth;
            let newHeight = startHeight;
            let newLeft = startLeft;
            let newTop = startTop;
            
            // Check if any corners are locked (explicit or temporary auto lock)
            const hasLockedCorner = Object.values(lockedCorners).some(locked => locked) || !!autoLockedCorner;
            
            if (hasLockedCorner && lockedCornerPos) {
                // Find which corner is locked
                let anchorCorner = null;
                if (autoLockedCorner) {
                    anchorCorner = autoLockedCorner;
                } else {
                    for (let corner in lockedCorners) {
                        if (lockedCorners[corner]) {
                            anchorCorner = corner;
                            break;
                        }
                    }
                }
                
                const areaRect = canvasArea.getBoundingClientRect();
                const anchorX = lockedCornerPos.x;
                const anchorY = lockedCornerPos.y;
                const mouseX = e.clientX;
                const mouseY = e.clientY;
                
                // New size from distance between mouse and anchor
                newWidth = Math.max(200, Math.abs(mouseX - anchorX));
                newHeight = Math.max(200, Math.abs(mouseY - anchorY));
                
                // Position top-left at min(mouse, anchor) to keep opposite corner fixed
                newLeft = Math.min(mouseX, anchorX) - areaRect.left;
                newTop = Math.min(mouseY, anchorY) - areaRect.top;
            } else {
                // No locked corners - each edge moves independently
                // Start with current values
                newWidth = startWidth;
                newHeight = startHeight;
                newLeft = startLeft;
                newTop = startTop;
                
                // Handle horizontal resizing
                if (resizeDirection.includes('e')) {
                    // Dragging right edge - increase width, left stays same
                    newWidth = Math.max(200, startWidth + dx);
                } else if (resizeDirection.includes('w')) {
                    // Dragging left edge - change both width and position
                    const proposedWidth = startWidth - dx;
                    if (proposedWidth >= 200) {
                        newWidth = proposedWidth;
                        newLeft = startLeft + dx;
                        console.log('West drag:', { dx, proposedWidth, newWidth, newLeft, startLeft });
                    } else {
                        // Hit minimum width - stop at 200px
                        newWidth = 200;
                        newLeft = startLeft + (startWidth - 200);
                    }
                }
                
                // Handle vertical resizing
                if (resizeDirection.includes('s')) {
                    // Dragging bottom edge - increase height, top stays same
                    newHeight = Math.max(200, startHeight + dy);
                } else if (resizeDirection.includes('n')) {
                    // Dragging top edge - change both height and position
                    const proposedHeight = startHeight - dy;
                    if (proposedHeight >= 200) {
                        newHeight = proposedHeight;
                        newTop = startTop + dy;
                    } else {
                        // Hit minimum height - stop at 200px
                        newHeight = 200;
                        newTop = startTop + (startHeight - 200);
                    }
                }
            }
            
            canvasWrapper.style.width = newWidth + 'px';
            canvasWrapper.style.height = newHeight + 'px';
            canvasWrapper.style.left = newLeft + 'px';
            canvasWrapper.style.top = newTop + 'px';
            
            updateCanvasSize();
        });
        
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                resizeDirection = null;
                autoLockedCorner = null; // clear temporary lock
                
                // Ensure final canvas size update
                updateCanvasSize();
                
                setTimeout(() => {
                    if (!canvasWrapper.matches(':hover')) {
                        sizeDisplay.style.opacity = '0';
                    }
                }, 100);
            }
        });
        
        const trailCtx = trailCanvas.getContext('2d');
        
        function getCanvasCoordinates(e) {
            const rect = canvas.getBoundingClientRect();
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        }
        
        const colorStorage = {
            save: function(colors) {
                try {
                    savedColors = colors;
                    localStorage.setItem('fluidSimColors', JSON.stringify(colors));
                    renderSavedColors();
                    if (typeof updatePaletteStepIndicator === 'function') updatePaletteStepIndicator();
                } catch (e) {
                    console.error('Error saving colors:', e);
                }
            },
            
            add: function(color) {
                if (!savedColors.includes(color)) {
                    savedColors.push(color);
                    this.save(savedColors);
                }
            },
            
            remove: function(color) {
                savedColors = savedColors.filter(c => c !== color);
                this.save(savedColors);
            },
            
            clear: function() {
                this.save([]);
            },
            
            getAll: function() {
                return savedColors;
            },
            
            load: function() {
                try {
                    const stored = localStorage.getItem('fluidSimColors');
                    if (stored) {
                        savedColors = JSON.parse(stored);
                        renderSavedColors();
                        if (typeof updatePaletteStepIndicator === 'function') updatePaletteStepIndicator();
                    }
                } catch (e) {
                    console.error('Error loading colors:', e);
                }
            }
        };
        
        customCursor.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
                <path d="M2 26L6 30L8 28L7 31L9 29L10 32L12 29L14 31L16 28" 
                      fill="none"
                      stroke="#000" 
                      stroke-width="2"
                      stroke-linecap="round"/>
                <path d="M28 4L24 8L10 22L8 20L22 6L26 2Z" 
                      fill="#000"/>
                <circle cx="8" cy="24" r="1.5" fill="#000"/>
                <circle cx="6" cy="22" r="1" fill="#000"/>
                <circle cx="10" cy="23" r="1" fill="#000"/>
            </svg>
        `;
        
        function showPreview() {
            canvas.classList.add('hidden');
        }
        
        function hidePreview() {
            canvas.classList.remove('hidden');
        }
        
        let recEnabled = false;
        let recLayers = [];
        let recActiveLayerId = null;
        let recNextLayerId = 1;
        let recIsPlayingAll = false;
        let recMaxDurationMs = 10000;
        let recLastPlaybackTime = Date.now();
        let recPlaybackSpeed = 1;
        let recRenderQueued = false;
