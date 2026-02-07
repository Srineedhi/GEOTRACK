// ===== Carbon Footprint Tracker - Main JavaScript File =====

const API_URL = 'http://localhost:5000/api';

// ===== USER AUTHENTICATION =====

// Register a new user
// Register a new user
async function registerUser() {
    // Get form values
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const accountType = document.getElementById('accountType').value;
    const gender = document.getElementById('gender').value;

    console.log('Attempting registration for:', username, email);

    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                email,
                username,
                password,
                accountType,
                gender
            })
        });

        const data = await response.json();
        console.log('Registration response:', data);

        if (response.ok) {
            alert('Registration successful! Redirecting to login...');
            window.location.href = 'login.html';
        } else {
            alert('Registration Failed: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Registration Error:', error);
        alert('Connection Error: Could not reach the server. Is it running?');
    }
}

// Login user
async function loginUser() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST', // Backend expects POST
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                password
            })
        });

        const data = await response.json();

        if (response.ok) {
            // Save token and user info
            localStorage.setItem('token', data.token);
            localStorage.setItem('currentUser', JSON.stringify(data));

            // Redirect to dashboard
            window.location.href = 'dashboard.html';
        } else {
            alert(data.message || 'Invalid username or password!');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred during login.');
    }
}

// Check if user is authenticated
function checkAuth() {
    const token = localStorage.getItem('token');

    if (!token) {
        // Redirect to login if not authenticated
        window.location.href = 'login.html';
    }
}

// Logout user
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
}

// ===== DASHBOARD FUNCTIONS =====

// Load dashboard data
async function loadDashboard() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('currentUser'));

    if (!token || !user) {
        window.location.href = 'login.html';
        return;
    }

    document.getElementById('welcomeUser').textContent = `Welcome, ${user.name}`;
    if (document.getElementById('userCoins')) {
        document.getElementById('userCoins').textContent = user.ecoCoins || 100;
    }

    // Trigger Welcome Modal for new users
    if (!localStorage.getItem('welcomeShown')) {
        const welcomeModal = document.getElementById('welcomeModal');
        if (welcomeModal) {
            welcomeModal.style.display = 'block';
        }
    }

    try {
        // 1. Fetch Summary (Daily, Monthly, Yearly)
        const summaryRes = await fetch(`${API_URL}/dashboard/summary`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (summaryRes.ok) {
            const data = await summaryRes.json();

            // Check if results are estimates (lifestyle)
            const isEst = data.isEstimated ? ' <small class="est-badge">(Estimated)</small>' : '';

            document.getElementById('dailyEmissions').innerHTML = data.summary.daily.toFixed(1) + isEst;
            document.getElementById('monthlyEmissions').innerHTML = data.summary.monthly.toFixed(1) + isEst;
            document.getElementById('yearlyEmissions').innerHTML = data.summary.yearly.toFixed(1) + isEst;

            const highest = data.highestContributor;
            if (highest && highest !== 'none') {
                document.getElementById('highestContributor').textContent = highest.charAt(0).toUpperCase() + highest.slice(1);
                updateInsightBox(highest);
            }
        }

        // 2. Fetch Progress Stats (Tasks, Days)
        const statsRes = await fetch(`${API_URL}/dashboard/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (statsRes.ok) {
            const stats = await statsRes.json();
            document.getElementById('tasksCompleted').textContent = stats.completedTasks;
            document.getElementById('daysTracked').textContent = stats.daysTracked;
        }

        // 3. Indian Benchmarks & Timeline
        const historyRes = await fetch(`${API_URL}/emissions/history`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (historyRes.ok) {
            const history = await historyRes.json();
            updateBenchmarks(history, user.accountType);
            renderTimeline(history);
            calculateWeeklyRewards(history);

            // Check & Render Badges
            // We need stats for the tasks badge, so we'll re-use the stats from above if possible
            // But stats are in a different scope. Let's just pass mock or 0 if not available, 
            // OR better, move this call inside the Promise.all if we refactored, but here simple is fine.
            // Let's grab the task count from the DOM if already rendered?
            const tasksCount = parseInt(document.getElementById('tasksCompleted').textContent) || 0;
            checkBadges(history, tasksCount);
        }

    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

// Indian Benchmarks Comparison
function updateBenchmarks(history, accountType) {
    const now = new Date();
    const currentMonth = history.filter(h => {
        const d = new Date(h.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).reduce((acc, h) => acc + h.totalEmissions, 0);

    const benchmark = accountType === 'family' ? 950 : 250;
    const pill = document.getElementById('benchmarkStatusPill');
    if (!pill) return;

    if (currentMonth < benchmark * 0.9) {
        pill.textContent = 'Below Indian Average';
        pill.className = 'status-pill status-low';
    } else if (currentMonth <= benchmark * 1.1) {
        pill.textContent = 'Around Indian Average';
        pill.className = 'status-pill status-mid';
    } else {
        pill.textContent = 'Above Indian Average';
        pill.className = 'status-pill status-high';
    }
}

// Weekly Reward Logic
function calculateWeeklyRewards(history) {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfPrevWeek = new Date(new Date(startOfWeek).setDate(startOfWeek.getDate() - 7));

    const thisWeek = history.filter(h => new Date(h.date) >= startOfWeek).reduce((acc, h) => acc + h.totalEmissions, 0);
    const lastWeek = history.filter(h => new Date(h.date) >= startOfPrevWeek && new Date(h.date) < startOfWeek).reduce((acc, h) => acc + h.totalEmissions, 0);

    const progressText = document.getElementById('weeklyReductionText');
    const progressBar = document.getElementById('weeklyProgressBar');

    if (lastWeek > 0) {
        const reduction = ((lastWeek - thisWeek) / lastWeek) * 100;
        if (reduction > 0) {
            progressText.textContent = `${reduction.toFixed(1)}% reduction`;
            progressBar.style.width = `${Math.min(reduction * 2, 100)}%`;
            progressBar.style.background = 'var(--primary)';
        } else {
            progressText.textContent = '0% reduction';
            progressBar.style.width = '0%';
        }
    } else {
        progressText.textContent = 'Initial Week';
        progressBar.style.width = '10%';
    }
}

// Render Historical Timeline with Comparison
function renderTimeline(history) {
    const container = document.getElementById('historyTimeline');
    if (!container) return;

    // Filter by unique category and sort
    // Filter by unique category and sort (Newest first)
    const timelineHTML = history.slice(0, 5).map((h, index) => {
        // Find previous entry of same category for comparison
        const prevOfSame = history.slice(index + 1).find(p => p.category === h.category);
        let comparison = '';

        if (prevOfSame) {
            const isLower = h.totalEmissions < prevOfSame.totalEmissions;
            comparison = isLower
                ? `<span style="color: var(--status-green); font-size: 0.75rem;">▼</span>`
                : `<span style="color: var(--status-red); font-size: 0.75rem;">▲</span>`;
        }

        // Map status to Good/Bad
        let statusText = 'GOOD';
        let statusColor = 'var(--status-green)';

        const label = (h.metadata && h.metadata.statusLabel) ? h.metadata.statusLabel : '';
        if (label === 'Above Average' || label === 'Over Used') {
            statusText = 'BAD';
            statusColor = 'var(--status-red)';
        } else if (label === 'Around Average' || label === 'In Limit') {
            statusText = 'AVERAGE';
            statusColor = 'var(--status-yellow)';
        }

        return `
            <div class="timeline-item animate-slide-up" style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 1.2rem; margin-bottom: 1rem; border-left: 4px solid ${statusColor}; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; flex-direction: column; gap: 0.4rem;">
                        <div style="display: flex; align-items: center; gap: 0.8rem;">
                            <strong style="color: var(--bg-white); text-transform: uppercase; font-size: 0.85rem; letter-spacing: 0.5px; background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 4px;">${h.category} BILL</strong>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.6rem;">
                            <span style="font-weight: 800; color: var(--bg-white); font-size: 1.1rem; line-height: 1;">
                                ${h.totalEmissions.toFixed(1)} <small style="font-size: 0.7rem; color: var(--text-muted); font-weight: 400;">kg CO₂e</small>
                            </span>
                            ${comparison}
                            <span style="background: ${statusColor}; color: white; padding: 2px 10px; border-radius: 4px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase;">${statusText}</span>
                        </div>
                    </div>
                    <div style="text-align: right; color: var(--text-muted); font-size: 0.85rem; font-weight: 400; opacity: 0.8;">
                        ${new Date(h.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                </div>
            </div>
        `;
    }).join('') || '<p style="color: rgba(255,255,255,0.5);">No history recorded yet. Start tracking to see your journey!</p>';

    container.innerHTML = timelineHTML;
}

function redeemCoins() {
    window.location.href = 'rewards.html';
}


function closeWelcomeModal() {
    document.getElementById('welcomeModal').style.display = 'none';
    localStorage.setItem('welcomeShown', 'true');
}

// ===== OCR & BILL ANALYSIS =====

let lastAnalysisResult = null;

function handleOCRUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('uploadPlaceholder').style.display = 'none';
        document.getElementById('imagePreview').style.display = 'block';
        document.getElementById('previewImg').src = e.target.result;
    };
    reader.readAsDataURL(file);

    // Initial OCR scan
    startOCR(file);
}

async function startOCR(file) {
    const loading = document.getElementById('ocrLoading');
    const status = document.getElementById('ocrStatus');
    const analyzeBtn = document.getElementById('analyzeBtn');

    loading.style.display = 'block';
    analyzeBtn.disabled = true;
    status.textContent = 'Initializing OCR engine...';

    try {
        const text = await ocrService.extractText(file, (m) => {
            if (m.status === 'recognizing text') {
                status.textContent = `Extracting text: ${Math.round(m.progress * 100)}%`;
            }
        });

        document.getElementById('extractedText').value = text;

        status.textContent = 'Text extracted successfully!';
        setTimeout(() => loading.style.display = 'none', 1000);
        analyzeBtn.disabled = false;

    } catch (error) {
        console.error('OCR Error:', error);
        status.textContent = 'Error extracting text. Try a clearer image.';
        analyzeBtn.disabled = true;
    }
}

async function analyzeBillOCR() {
    const billText = document.getElementById('extractedText').value;
    const token = localStorage.getItem('token');

    if (!billText || !token) return;

    const loading = document.getElementById('ocrLoading');
    const status = document.getElementById('ocrStatus');
    loading.style.display = 'block';
    status.textContent = 'Analyzing content with AI...';

    try {
        const response = await fetch(`${API_URL}/emissions/analyze-bill`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ billText })
        });

        if (response.ok) {
            const result = await response.json();
            lastAnalysisResult = result;
            showAnalysisResults(result);
        } else {
            alert('Analysis failed. The text might be too unreadable.');
        }
    } catch (error) {
        console.error('Analysis Error:', error);
        alert('Server error during analysis.');
    } finally {
        loading.style.display = 'none';
    }
}

function showAnalysisResults(result) {
    document.getElementById('resEmissions').textContent = `${result.carbonEmissions.toFixed(2)} kg`;

    const statusPill = document.getElementById('resStatusPill');
    statusPill.textContent = result.statusLabel || 'Unknown';

    // Apply color based on status
    if (result.statusLabel === 'Below Average') statusPill.style.color = 'var(--status-green)';
    else if (result.statusLabel === 'Around Average') statusPill.style.color = 'var(--status-yellow)';
    else if (result.statusLabel === 'Above Average') statusPill.style.color = 'var(--status-red)';

    // Main Cause
    const mainCauseEl = document.getElementById('resMainCause');
    if (mainCauseEl && result.dominantContributor) {
        mainCauseEl.textContent = result.dominantContributor.name;
        mainCauseEl.style.color = result.dominantContributor.impact > 10 ? 'var(--status-red)' : 'var(--status-green)';
    }

    // History Note
    const historyNoteEl = document.getElementById('resHistoryNote');
    if (historyNoteEl && result.historyComparison) {
        if (result.historyComparison.status === 'improved') {
            historyNoteEl.innerHTML = `<span style="color: var(--status-green)">✅ Improvement: ${result.historyComparison.difference.toFixed(2)} kg lower than last time!</span>`;
        } else if (result.historyComparison.status === 'regressed') {
            historyNoteEl.innerHTML = `<span style="color: var(--status-red)">⚠️ Attention: ${result.historyComparison.difference.toFixed(2)} kg higher than last scan.</span>`;
        } else {
            historyNoteEl.innerHTML = `<span style="color: var(--status-yellow)">⚖️ Stable: Same as your last bill in this category.</span>`;
        }
    }

    // Feedback Message (Generic top-level summary)
    const feedbackEl = document.getElementById('resFeedback');
    if (feedbackEl) {
        feedbackEl.innerHTML = `<p style="font-size: 1.1rem; font-weight: 600; margin: 1rem 0; color: var(--forest);">Your ${result.billType} usage is categorized as follows:</p>`;
    }

    // Items
    const itemsList = document.getElementById('resItems');
    itemsList.innerHTML = result.detectedItems.map(item => `
        <div class="item-entry">
            <span><strong>${item.name}</strong> (${item.quantity})</span>
            <span class="impact">${item.co2Impact.toFixed(2)} kg CO₂</span>
        </div>
    `).join('') || '<p>No specific items recognized.</p>';

    // Tips (Unique 3-5 suggestions)
    const tipsSection = document.getElementById('tipsSection');
    const tipsList = document.getElementById('resTips');

    if (result.reductionTips && result.reductionTips.length > 0) {
        tipsSection.style.display = 'block';
        tipsList.innerHTML = result.reductionTips.map(tip => `
            <div class="tip-card" style="border-left: 3.5px solid var(--primary); padding: 0.8rem 1rem; margin-bottom: 0.8rem; background: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <p style="font-size: 0.95rem; margin: 0; line-height: 1.4; color: var(--forest); font-weight: 500;">${tip}</p>
            </div>
        `).join('');
    } else {
        tipsSection.style.display = 'none';
    }

    document.getElementById('analysisModal').style.display = 'block';
}

async function confirmAnalysis() {
    if (!lastAnalysisResult) return;

    // Save to history (backend call)
    const type = lastAnalysisResult.billType.toLowerCase().includes('electricity') ? 'electricity' :
        lastAnalysisResult.billType.toLowerCase().includes('gas') ? 'gas' : 'grocery';

    const bagType = document.getElementById('scannerBagType').value || 'NONE';

    // Construct unified payload for calculateEmissions
    const saveData = {
        ...lastAnalysisResult,
        bagType: bagType,
        entryType: 'bill_upload'
    };

    // Mapping for specific backend expectations in calculateEmissions
    if (type === 'grocery') {
        saveData.items = (lastAnalysisResult.detectedItems || []).map(it => {
            const qtyVal = parseFloat(it.quantity);
            let unitVal = 'unit';
            if (typeof it.quantity === 'string' && it.quantity.includes(' ')) {
                unitVal = it.quantity.split(' ').pop();
            }
            return {
                name: it.name,
                quantity: isNaN(qtyVal) ? 1 : qtyVal,
                unit: unitVal
            };
        });
    } else if (type === 'electricity') {
        saveData.units = (lastAnalysisResult.detectedItems && lastAnalysisResult.detectedItems[0]) ?
            parseFloat(lastAnalysisResult.detectedItems[0].quantity) || 0 : 0;
    } else if (type === 'gas') {
        saveData.kg = (lastAnalysisResult.detectedItems && lastAnalysisResult.detectedItems[0]) ?
            parseFloat(lastAnalysisResult.detectedItems[0].quantity) || 0 : 0;
    }

    try {
        await saveRecord(type, saveData);

        // Show success with Reward info (Backend handles the actual increment)
        displayCoinReward(20);

        alert('✅ Success! Your bill analysis and 20 Eco Coins have been saved to history.');
        closeAnalysisModal();
        removeOCRImage();
        loadDashboard();
    } catch (error) {
        console.error('Save Error:', error);
        alert('Failed to save data to history. Please try again.');
    }
}

function displayCoinReward(amount) {
    const hub = document.getElementById('userCoins');
    if (!hub) return;

    // Update coin count
    const originalText = hub.innerText;
    const currentCount = parseInt(originalText) || 0;
    const newCount = currentCount + amount;
    hub.innerText = `${newCount}`;

    // Premium animation: pulse + glow
    hub.style.transition = 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
    hub.style.color = '#10b981';
    hub.style.transform = 'scale(1.3)';
    hub.style.textShadow = '0 0 20px rgba(16, 185, 129, 0.8)';

    // Create floating reward notification
    const floatingReward = document.createElement('div');
    floatingReward.innerHTML = `+${amount} 🪙`;
    floatingReward.style.cssText = `
        position: fixed;
        top: 60px;
        right: 120px;
        font-size: 1.5rem;
        font-weight: 800;
        color: #10b981;
        background: rgba(255, 255, 255, 0.95);
        padding: 0.8rem 1.5rem;
        border-radius: 50px;
        box-shadow: 0 8px 24px rgba(16, 185, 129, 0.3);
        z-index: 10000;
        animation: floatUpReward 2s ease-out forwards;
        pointer-events: none;
    `;

    // Add keyframe animation dynamically if not exists
    if (!document.getElementById('floatUpRewardStyle')) {
        const style = document.createElement('style');
        style.id = 'floatUpRewardStyle';
        style.innerHTML = `
            @keyframes floatUpReward {
                0% { opacity: 1; transform: translateY(0) scale(0.8); }
                50% { opacity: 1; transform: translateY(-30px) scale(1.1); }
                100% { opacity: 0; transform: translateY(-80px) scale(0.9); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(floatingReward);

    // Remove floating element after animation
    setTimeout(() => {
        floatingReward.remove();
    }, 2000);

    // Reset hub styling
    setTimeout(() => {
        hub.style.color = 'inherit';
        hub.style.transform = 'scale(1)';
        hub.style.textShadow = 'none';
    }, 800);
}

function closeAnalysisModal() {
    document.getElementById('analysisModal').style.display = 'none';
}

function removeOCRImage() {
    document.getElementById('imageInput').value = '';
    document.getElementById('uploadPlaceholder').style.display = 'block';
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('previewImg').src = '';
    document.getElementById('extractedText').value = '';
}

// ===== PREVIOUS IMAGE HANDLER (Cleanup) =====
function handleImageUpload(event) {
    // Legacy support or fallback
    handleOCRUpload(event);
}

// ===== ADVANCED EMISSION CALCULATOR =====

let currentGroceryItems = [];

// Add item to the local grocery list
function addGroceryItem() {
    const nameInput = document.getElementById('itemName');
    const qtyInput = document.getElementById('itemQty');
    const unitInput = document.getElementById('itemUnit');

    const name = nameInput.value;
    const quantity = parseFloat(qtyInput.value);
    const unit = unitInput.value;

    if (!name || isNaN(quantity)) {
        alert('Please enter item name and quantity');
        return;
    }

    const item = { name, quantity, unit };
    currentGroceryItems.push(item);
    renderItemTable();

    // Clear inputs
    nameInput.value = '';
    qtyInput.value = '';
    nameInput.focus();
}

// Render the grocery items table
function renderItemTable() {
    const tbody = document.getElementById('itemTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    currentGroceryItems.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.name}</td>
            <td class="text-muted small">Auto-detecting...</td>
            <td>${item.quantity} ${item.unit}</td>
            <td><button type="button" class="btn btn-secondary btn-small" onclick="removeGroceryItem(${index})">Remove</button></td>
        `;
        tbody.appendChild(row);
    });
}

// Remove item from list
function removeGroceryItem(index) {
    currentGroceryItems.splice(index, 1);
    renderItemTable();
}

// Handle real bill upload in the calculator
function handleBillUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Please upload an image file (JPG, PNG, etc.)');
        return;
    }

    // Show loading state in the specific section
    const uploadArea = event.target.parentElement.parentElement;
    const statusEl = document.createElement('div');
    statusEl.className = 'ocr-mini-status';
    statusEl.style.cssText = `
        text-align: center;
        padding: 1rem;
        background: rgba(16, 185, 129, 0.1);
        border-radius: 8px;
        margin-top: 1rem;
        font-weight: 600;
        color: var(--primary);
    `;
    statusEl.innerHTML = '🔄 Scanning bill... <span id="ocrProgress">0%</span>';
    uploadArea.appendChild(statusEl);

    // Reuse the existing startOCR logic but target the calculator's state
    startOCRPure(file, (progress) => {
        const progressSpan = document.getElementById('ocrProgress');
        if (progressSpan) {
            progressSpan.textContent = `${Math.round(progress * 100)}%`;
        }
    }).then(text => {
        statusEl.innerHTML = '🤖 Analyzing content with AI...';

        if (!text || text.trim().length < 10) {
            throw new Error('Could not extract readable text from image');
        }

        return fetch(`${API_URL}/emissions/analyze-bill`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ billText: text })
        });
    }).then(res => {
        if (!res.ok) {
            throw new Error('Analysis failed');
        }
        return res.json();
    }).then(result => {
        statusEl.remove();

        if (result.billType === 'Grocery') {
            result.detectedItems.forEach(it => {
                currentGroceryItems.push({
                    name: it.name,
                    quantity: parseFloat(it.quantity),
                    unit: it.quantity.split(' ')[1] || 'kg'
                });
            });
            renderItemTable();
            displayCoinReward(15); // Reward for successful OCR
            alert(`✅ OCR Success! Extracted ${result.detectedItems.length} items from Grocery bill. +15 Eco Coins!`);
        } else if (result.billType.includes('Electricity')) {
            const units = parseFloat(result.detectedItems[0].quantity);
            document.getElementById('electricityUnits').value = units;
            displayCoinReward(15); // Reward for successful OCR
            alert(`✅ OCR Success! Detected ${units} kWh from Electricity bill. +15 Eco Coins!`);
        } else if (result.billType.includes('Gas')) {
            const qty = parseFloat(result.detectedItems[0].quantity);
            document.getElementById('gasKg').value = qty;
            displayCoinReward(15); // Reward for successful OCR
            alert(`✅ OCR Success! Detected ${qty} ${result.billType.includes('PNG') ? 'SCM' : 'kg'} from Gas bill. +15 Eco Coins!`);
        }
    }).catch(err => {
        console.error('OCR Error:', err);
        statusEl.style.background = 'rgba(239, 68, 68, 0.1)';
        statusEl.style.color = '#dc2626';
        statusEl.innerHTML = `❌ ${err.message || 'OCR failed'}. Please try a clearer image or enter manually.`;
        setTimeout(() => statusEl.remove(), 5000);
    });
}

// Pure OCR helper without UI side-effects
async function startOCRPure(file, progressCallback) {
    const worker = await Tesseract.createWorker('eng', 1, {
        logger: m => {
            if (m.status === 'recognizing text' && progressCallback) {
                progressCallback(m.progress);
            }
        }
    });
    const { data: { text } } = await worker.recognize(file);
    await worker.terminate();
    return text;
}

// Calculate advanced emissions (Single Category at a time for better UX)
async function calculateAdvancedEmissions() {
    const token = localStorage.getItem('token');
    if (!token) return;

    // We will collect all data and save as separate records or one combined?
    // Requirement says: "Combine: Grocery + Electricity + Gas emissions."
    // But typically users might upload a bill separately. 
    // Let's implement categorical saving.

    try {
        // 1. Grocery
        if (currentGroceryItems.length > 0) {
            const bagType = document.getElementById('bagType').value;
            await saveRecord('grocery', { items: currentGroceryItems, bagType });
            currentGroceryItems = [];
            renderItemTable();
        }

        // 2. Electricity
        const eUnits = parseFloat(document.getElementById('electricityUnits').value);
        if (!isNaN(eUnits)) {
            await saveRecord('electricity', { units: eUnits });
        }

        // 3. Gas
        const gKg = parseFloat(document.getElementById('gasKg').value);
        if (!isNaN(gKg)) {
            await saveRecord('gas', { kg: gKg });
        }

        alert('Calculations saved! Redirecting to Dashboard...');
        window.location.href = 'dashboard.html';

    } catch (error) {
        console.error('Calculation Error:', error);
        alert('Error saving data');
    }
}

// Helper to save emission record to backend
async function saveRecord(type, data) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/emissions/calculate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ type, data })
    });

    if (!response.ok) throw new Error('Failed to save ' + type);
    return response.json();
}


// ===== DAILY TASKS =====

// Load tasks for today
// ===== DAILY TASKS =====

const DAILY_MISSIONS = [
    { id: 1, text: "Turned off lights when leaving the room", icon: "💡", completed: false },
    { id: 2, text: "Used natural light instead of bulbs", icon: "☀️", completed: false },
    { id: 3, text: "Took a shorter shower (under 5 mins)", icon: "🚿", completed: false },
    { id: 4, text: "Used a reusable water bottle", icon: "💧", completed: false },
    { id: 5, text: "Refused a single-use plastic bag", icon: "🛍️", completed: false },
    { id: 6, text: "Walked/Cycled short distance", icon: "🚲", completed: false },
    { id: 7, text: "Ate a fully plant-based meal", icon: "🥗", completed: false },
    { id: 8, text: "Unplugged chargers not in use", icon: "🔌", completed: false },
    { id: 9, text: "Separated wet and dry waste", icon: "♻️", completed: false },
    { id: 10, text: "Shared an eco-tip with a friend", icon: "🗣️", completed: false }
];

// Load tasks (Client-side persistence for demo)
function loadTasks() {
    const today = new Date().toISOString().split('T')[0];
    const saved = localStorage.getItem(`missions_${today}`);
    let tasks = saved ? JSON.parse(saved) : DAILY_MISSIONS;

    // Ensure we have all 10 structure if starting fresh
    if (!saved) {
        tasks = JSON.parse(JSON.stringify(DAILY_MISSIONS)); // Deep copy
    }

    renderTasks(tasks);
    updateProgress(tasks);
}

// Render tasks
function renderTasks(tasks) {
    const taskList = document.getElementById('taskList');
    if (!taskList) return;
    taskList.innerHTML = '';

    tasks.forEach((task, index) => {
        const li = document.createElement('li');
        li.className = `task-item ${task.completed ? 'completed' : ''}`;
        li.innerHTML = `
            <input type="checkbox" class="task-checkbox" 
                   ${task.completed ? 'checked' : ''} 
                   onchange="toggleTask(${index}, this)">
            <span class="task-icon" style="font-size: 1.5rem;">${task.icon}</span>
            <div class="task-info">
                <div class="task-title">${task.text}</div>
                <div class="task-impact">Save ~0.5 kg CO₂</div>
            </div>
        `;
        taskList.appendChild(li);
    });
}

// Toggle task
function toggleTask(index, checkbox) {
    const today = new Date().toISOString().split('T')[0];
    const saved = localStorage.getItem(`missions_${today}`);
    let tasks = saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(DAILY_MISSIONS));

    tasks[index].completed = checkbox.checked;
    localStorage.setItem(`missions_${today}`, JSON.stringify(tasks));

    loadTasks(); // Re-render to update UI states
}

// Update progress bar
function updateProgress(tasks) {
    const completed = tasks.filter(t => t.completed).length;
    const total = tasks.length;
    const percentage = (completed / total) * 100;

    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    if (progressFill) progressFill.style.width = `${percentage}%`;
    if (progressText) progressText.textContent = `${completed} / ${total} Tasks`;
}

// Submit Missions
function submitMissions() {
    const today = new Date().toISOString().split('T')[0];
    const saved = localStorage.getItem(`missions_${today}`);
    const tasks = saved ? JSON.parse(saved) : [];

    const completedCount = tasks.filter(t => t.completed).length;

    if (completedCount === 0) {
        alert("Please complete at least one mission!");
        return;
    }

    // Award Coins
    const reward = completedCount * 5; // 5 coins per task
    displayCoinReward(reward);

    alert(`🎉 Awesome! You completed ${completedCount} missions today.\nYou earned ${reward} Eco Coins!`);

    // Lock them or just reset? For now, we leave them checked as "submitted".
    // Theoretically we could disable the inputs here.
}

// Reset tasks
function resetTasks() {
    if (!confirm('Reset all progress for today?')) return;
    const today = new Date().toISOString().split('T')[0];
    localStorage.removeItem(`missions_${today}`);
    loadTasks();
}

// ===== GRAPH PAGE =====

// Load and draw the graph
async function loadGraph() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/emissions/history`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const history = await response.json();

            // Update comparison cards
            if (history.length > 0) {
                const now = new Date();
                const m = now.getMonth();
                const y = now.getFullYear();

                const latestEmission = history.filter(h => {
                    const d = new Date(h.date);
                    return d.getMonth() === m && d.getFullYear() === y;
                }).reduce((acc, h) => acc + h.totalEmissions, 0);

                const afterValue = document.getElementById('afterValue');
                if (afterValue) afterValue.textContent = latestEmission.toFixed(0);

                const avgHousehold = 500;
                const savings = Math.max(0, avgHousehold - latestEmission);
                const savingsValue = document.getElementById('savingsValue');
                if (savingsValue) savingsValue.textContent = savings.toFixed(0);
            }

            drawChart(history);
        }
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

// Draw the emission chart using Canvas
function drawChart(history) {
    const canvas = document.getElementById('emissionChart');
    if (!canvas) return; // Guard clause

    const ctx = canvas.getContext('2d');

    // Set canvas size
    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = 300;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 50;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Get last 6 months of data
    const months = getLastMonths(6);
    const avgHousehold = 500;

    // Prepare data points
    // Backend returns 'month' string e.g. "October 2023" or date obj.
    // Our 'getLastMonths' returns { monthIndex, year }.
    // We need to match backend data to these months.

    const userEmissions = months.map(month => {
        // Sum all records for this month
        return history.filter(h => {
            const date = new Date(h.date);
            return date.getMonth() === month.monthIndex && date.getFullYear() === month.year;
        }).reduce((acc, h) => acc + h.totalEmissions, 0);
    });

    // Find max value for scaling
    const maxValue = Math.max(avgHousehold, ...userEmissions) + 100;

    // Calculate bar dimensions
    const barWidth = (width - padding * 2) / months.length / 2.5;
    const groupWidth = (width - padding * 2) / months.length;

    // Draw grid lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;

    for (let i = 0; i <= 5; i++) {
        const y = padding + (height - padding * 2) * (i / 5);
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();

        // Draw y-axis labels
        const value = Math.round(maxValue * (1 - i / 5));
        ctx.fillStyle = '#64748b';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${value}`, padding - 10, y + 4);
    }

    // Draw bars
    months.forEach((month, index) => {
        const x = padding + groupWidth * index + groupWidth / 2;

        // User emission bar (green)
        const userHeight = (userEmissions[index] / maxValue) * (height - padding * 2);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(x - barWidth - 2, height - padding - userHeight, barWidth, userHeight);

        // Average household bar (gray)
        const avgHeight = (avgHousehold / maxValue) * (height - padding * 2);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(x + 2, height - padding - avgHeight, barWidth, avgHeight);

        // Draw month labels
        ctx.fillStyle = '#64748b';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(month.label, x, height - padding + 20);
    });

    // Draw axes
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();
}

// Get last N months
function getLastMonths(count) {
    const months = [];
    const now = new Date();

    for (let i = count - 1; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
            label: date.toLocaleString('default', { month: 'short' }),
            monthIndex: date.getMonth(),
            year: date.getFullYear()
        });
    }

    return months;
}

// Update graph when period changes
function updateGraph() {
    loadGraph();
}

// Load emission history table
async function loadHistory() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/emissions/history`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const records = await response.json();
            const tbody = document.getElementById('historyBody');
            const noDataMessage = document.getElementById('noDataMessage');

            if (!tbody) return;

            if (records.length === 0) {
                if (noDataMessage) noDataMessage.style.display = 'block';
                return;
            }

            if (noDataMessage) noDataMessage.style.display = 'none';
            tbody.innerHTML = '';

            // Aggregate records by Month/Year
            const monthlySummary = {};
            records.forEach(r => {
                const date = new Date(r.date);
                const monthKey = date.toLocaleString('default', { month: 'long', year: 'numeric' });

                if (!monthlySummary[monthKey]) {
                    monthlySummary[monthKey] = { electricity: 0, gas: 0, grocery: 0, total: 0 };
                }

                if (r.category === 'electricity') monthlySummary[monthKey].electricity += r.totalEmissions;
                else if (r.category === 'gas') monthlySummary[monthKey].gas += r.totalEmissions;
                else if (r.category === 'grocery') monthlySummary[monthKey].grocery += r.totalEmissions;

                monthlySummary[monthKey].total += r.totalEmissions;
            });

            // Convert map to sorted array (reverse chronological)
            const sortedMonths = Object.keys(monthlySummary).sort((a, b) => new Date(b) - new Date(a));

            sortedMonths.forEach(month => {
                const data = monthlySummary[month];
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${month}</td>
                    <td>${data.electricity.toFixed(1)} kg</td>
                    <td>${data.gas.toFixed(1)} kg</td>
                    <td>${data.grocery.toFixed(1)} kg</td>
                    <td><strong>${data.total.toFixed(1)} kg</strong></td>
                `;
                tbody.appendChild(row);
            });
        }
    } catch (error) {
        console.error('Error loading history table:', error);
    }
}

// Handle window resize for chart
window.addEventListener('resize', function () {
    const canvas = document.getElementById('emissionChart');
    if (canvas) {
        loadGraph();
    }
});
// Smart Insights Logic
function updateInsightBox(highest) {
    const box = document.getElementById('insightBox');
    const title = document.getElementById('insightTitle');
    const text = document.getElementById('insightText');
    if (!box) return;

    box.style.display = 'block';

    const insights = {
        grocery: {
            title: "Grocery Impact Spotted",
            text: "Reducing packaged foods and switching to local produce can save up to 15kg CO₂e monthly."
        },
        electricity: {
            title: "Energy Drain Detected",
            text: "Switching to LEDs and unplugging standby devices can reduce your bill and impact by 10%."
        },
        gas: {
            title: "Cooking Efficiency Tip",
            text: "Using a pressure cooker and batch cooking saves gas and reduces emissions significantly."
        },
        none: {
            title: "Great Start!",
            text: "Keep tracking your daily activities to unlock personalized sustainability insights."
        }
    };

    const insight = insights[highest] || insights.none;
    title.textContent = insight.title;
    text.textContent = insight.text;
}

// Badge system
function checkBadges(history, tasksDone) {
    const badges = [];
    if (history.length > 0) badges.push({ name: "Eco Starter", icon: "🌱" });
    if (history.length > 5) badges.push({ name: "Green Improver", icon: "🌿" });
    if (tasksDone > 10) badges.push({ name: "Sustainability Champ", icon: "🏆" });

    const container = document.getElementById('userBadges');
    if (!container) return;

    container.innerHTML = badges.map(b => `
        <div class="eco-badge">
            <span>${b.icon}</span> ${b.name}
        </div>
    `).join('');
}

// Award bonus coins (Mock Logic for demo)
async function awardBonusCoins(amount, reason) {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) return;

    user.ecoCoins = (user.ecoCoins || 100) + amount;
    localStorage.setItem('currentUser', JSON.stringify(user));

    if (document.getElementById('userCoins')) {
        document.getElementById('userCoins').textContent = user.ecoCoins;
        document.getElementById('userCoins').style.color = 'var(--accent)';
        setTimeout(() => document.getElementById('userCoins').style.color = '', 2000);
    }
}

// ===== LIFESTYLE ASSESSMENT =====
function openLifestyleModal() {
    document.getElementById('lifestyleModal').style.display = 'block';
}

function closeLifestyleModal() {
    document.getElementById('lifestyleModal').style.display = 'none';
}

async function submitLifestyle() {
    const household = parseInt(document.getElementById('lsHousehold').value);
    const diet = document.getElementById('lsDiet').value;
    const electricity = document.getElementById('lsElectricity').value;
    const fuel = document.getElementById('lsFuel').value;

    // specialized multipliers
    const baseEmission = 2000; // Base baseline per person/year in kg
    let multiplier = 1.0;

    // Diet impact
    if (diet === 'nonveg') multiplier += 0.5;
    else if (diet === 'mixed') multiplier += 0.2;

    // Energy impact
    if (electricity === 'high') multiplier += 0.4;
    else if (electricity === 'medium') multiplier += 0.1;

    // Household sharing
    if (household > 1) multiplier -= (household * 0.1); // Efficiency of scale

    const estimatedAnnual = Math.round(baseEmission * multiplier);
    const estimatedMonthly = Math.round(estimatedAnnual / 12);

    // Save to local storage for "Simulation" purposes or send to backend
    // For now, we update the dashboard UI directly for instant gratification
    document.getElementById('yearlyEmissions').innerHTML = `${estimatedAnnual} <small>(Est)</small>`;
    document.getElementById('monthlyEmissions').innerHTML = `${estimatedMonthly} <small>(Est)</small>`;

    // Save estimation to localStorage
    const user = JSON.parse(localStorage.getItem('currentUser'));
    user.baseline = estimatedAnnual;
    localStorage.setItem('currentUser', JSON.stringify(user));

    // Award Coins
    displayCoinReward(50);
    alert(`Assessment Complete!\n\nYour estimated annual footprint: ${estimatedAnnual} kg CO₂e.\n\nBaseline set! You earned 50 Eco Coins.`);

    closeLifestyleModal();
}

