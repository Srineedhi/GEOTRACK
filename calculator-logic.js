// ===== CATEGORY-SPECIFIC HISTORY DISPLAY =====

// Load history for the current tracker category
async function loadCategoryHistory(category) {
    const token = localStorage.getItem('token');
    if (!token) return;

    const historyContainerId = `${category}History`;
    const container = document.getElementById(historyContainerId);

    if (!container) return;

    try {
        const response = await fetch(`${API_URL}/emissions/history?category=${category}&limit=10`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const records = await response.json();
            renderCategoryHistory(container, records, category);
        } else {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">Failed to load history</p>';
        }
    } catch (error) {
        console.error('History Load Error:', error);
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">Error loading history</p>';
    }
}

// Render history in the format: Date - Bill - CO2 Emitted
function renderCategoryHistory(container, records, category) {
    if (!records || records.length === 0) {
        container.innerHTML = `
            <p style="text-align: center; color: var(--text-muted); padding: 2rem;">
                No ${category} scans yet. Upload a bill to get started! 📊
            </p>
        `;
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';

    records.forEach(record => {
        const date = new Date(record.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        const billType = category.charAt(0).toUpperCase() + category.slice(1);
        const co2 = record.totalEmissions.toFixed(2);

        // Determine status color
        let statusColor = '#10b981'; // green
        if (record.totalEmissions > 15) statusColor = '#ef4444'; // red
        else if (record.totalEmissions > 8) statusColor = '#f59e0b'; // yellow

        html += `
            <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0.75rem 1rem;
                background: rgba(16, 185, 129, 0.03);
                border-left: 4px solid ${statusColor};
                border-radius: 8px;
                transition: all 0.2s ease;
            " onmouseover="this.style.background='rgba(16, 185, 129, 0.08)'" onmouseout="this.style.background='rgba(16, 185, 129, 0.03)'">
                <div style="display: flex; align-items: center; gap: 1rem; flex: 1;">
                    <span style="
                        font-size: 0.85rem;
                        color: var(--text-muted);
                        font-weight: 600;
                        min-width: 90px;
                    ">${date}</span>
                    <span style="
                        font-size: 0.9rem;
                        color: var(--forest);
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    ">${billType} BILL</span>
                </div>
                <div style="
                    font-size: 1.1rem;
                    font-weight: 800;
                    color: ${statusColor};
                    display: flex;
                    align-items: center;
                    gap: 0.3rem;
                ">
                    ${co2} <span style="font-size: 0.75rem; font-weight: 500; opacity: 0.8;">kg CO₂e</span>
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

// Initialize history when calculator type is set
function initCalculatorType(type) {
    const title = document.getElementById('calculatorTitle');
    const subtitle = document.getElementById('calculatorSubtitle');
    const actions = document.getElementById('calculatorActions');

    // Hide all sections first
    document.getElementById('grocerySection').style.display = 'none';
    document.getElementById('electricitySection').style.display = 'none';
    document.getElementById('gasSection').style.display = 'none';

    // Show the selected section
    if (type === 'grocery') {
        document.getElementById('grocerySection').style.display = 'block';
        title.textContent = '🛒 Grocery Tracker';
        subtitle.textContent = 'Track your food and supplies carbon footprint.';
        loadCategoryHistory('grocery');
    } else if (type === 'electricity') {
        document.getElementById('electricitySection').style.display = 'block';
        title.textContent = '⚡ Electricity Tracker';
        subtitle.textContent = 'Monitor your energy consumption and emissions.';
        loadCategoryHistory('electricity');
    } else if (type === 'gas') {
        document.getElementById('gasSection').style.display = 'block';
        title.textContent = '🔥 Gas Tracker';
        subtitle.textContent = 'Track your cooking fuel usage and impact.';
        loadCategoryHistory('gas');
    }

    actions.style.display = 'block';
}

// Calculate footprint for the selected category
async function calculateSelectedFootprint() {
    const urlParams = new URLSearchParams(window.location.search);
    const type = urlParams.get('type') || 'grocery';
    const token = localStorage.getItem('token');

    if (!token) {
        alert('Please log in to calculate emissions.');
        return;
    }

    // Get User Account Type
    const user = JSON.parse(localStorage.getItem('currentUser')) || {};
    const accountType = user.accountType || 'individual';

    let payload = { type, data: {}, accountType };

    try {
        if (type === 'grocery') {
            if (currentGroceryItems.length === 0) {
                alert('Please add at least one grocery item.');
                return;
            }
            payload.data = {
                items: currentGroceryItems,
                bagType: document.getElementById('bagType').value || 'NONE'
            };
        } else if (type === 'electricity') {
            const units = parseFloat(document.getElementById('electricityUnits').value);
            if (!units || units <= 0) {
                alert('Please enter valid electricity units (kWh).');
                return;
            }
            payload.data = { units };
        } else if (type === 'gas') {
            const kg = parseFloat(document.getElementById('gasKg').value);
            if (!kg || kg <= 0) {
                alert('Please enter valid gas consumption (kg).');
                return;
            }
            payload.data = { kg };
        }

        const response = await fetch(`${API_URL}/emissions/calculate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const result = await response.json();
            displayCalculatorResults(result);

            // Award coins for calculation
            displayCoinReward(10);
        } else {
            alert('Calculation failed. Please check your inputs.');
        }
    } catch (error) {
        console.error('Calculation Error:', error);
        alert('Server error during calculation.');
    }
}

// Display calculation results
function displayCalculatorResults(result) {
    const resultsSection = document.getElementById('results');
    const totalResult = document.getElementById('totalResult');
    const breakdown = document.getElementById('detailedResultBreakdown');

    totalResult.textContent = result.totalEmissions.toFixed(2);

    // Build breakdown
    let breakdownHTML = '';

    // Add Status Label
    if (result.statusLabel) {
        const color = result.statusLabel.includes('Safe') || result.statusLabel.includes('Ok') ? '#10b981' : '#ef4444';
        breakdownHTML += `
            <div style="grid-column: 1 / -1; text-align: center; margin-bottom: 1rem; padding: 0.5rem; background: rgba(255,255,255,0.1); border-radius: 8px;">
                <span style="font-size: 1.2rem; font-weight: 700; color: ${color};">${result.statusLabel}</span>
            </div>
        `;
    }

    if (result.breakdown) {
        for (let key in result.breakdown) {
            breakdownHTML += `
                <div class="breakdown-item">
                    <div style="font-size: 0.8rem; text-transform: uppercase; opacity: 0.8;">${key}</div>
                    <div style="font-size: 1.5rem; font-weight: 700;">${result.breakdown[key].toFixed(2)} kg</div>
                </div>
            `;
        }
    }

    // Add Suggestions
    if (result.suggestions && result.suggestions.length > 0) {
        breakdownHTML += `<div style="grid-column: 1 / -1; text-align: left; margin-top: 1.5rem;">
            <h4 style="color: var(--accent); margin-bottom: 0.5rem;">💡 Smart Suggestions:</h4>
            <ul style="list-style: none; padding: 0;">`;

        result.suggestions.forEach(tip => {
            breakdownHTML += `<li style="margin-bottom: 0.5rem; display: flex; align-items: flex-start; gap: 0.5rem;">
                <span>✅</span> <span style="font-size: 0.95rem; opacity: 0.9;">${tip}</span>
            </li>`;
        });

        breakdownHTML += `</ul></div>`;
    }

    breakdown.innerHTML = breakdownHTML;

    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// Save emissions to history
async function saveEmissions() {
    const urlParams = new URLSearchParams(window.location.search);
    const type = urlParams.get('type') || 'grocery';
    const token = localStorage.getItem('token');

    if (!token) {
        alert('Please log in to save emissions.');
        return;
    }

    let payload = { type, data: {} };

    try {
        if (type === 'grocery') {
            if (currentGroceryItems.length === 0) {
                alert('No items to save.');
                return;
            }
            payload.data = {
                items: currentGroceryItems,
                bagType: document.getElementById('bagType').value || 'NONE'
            };
        } else if (type === 'electricity') {
            const units = parseFloat(document.getElementById('electricityUnits').value);
            if (!units || units <= 0) {
                alert('Please enter valid electricity units.');
                return;
            }
            payload.data = { units };
        } else if (type === 'gas') {
            const kg = parseFloat(document.getElementById('gasKg').value);
            if (!kg || kg <= 0) {
                alert('Please enter valid gas consumption.');
                return;
            }
            payload.data = { kg };
        }

        const response = await fetch(`${API_URL}/emissions/calculate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            // Award coins for saving
            displayCoinReward(20);

            alert('✅ Success! Your data has been saved to history and you earned 20 Eco Coins!');

            // Reload history to show the new entry
            loadCategoryHistory(type);

            // Reset form
            if (type === 'grocery') {
                currentGroceryItems = [];
                renderItemTable();
            } else if (type === 'electricity') {
                document.getElementById('electricityUnits').value = '';
            } else if (type === 'gas') {
                document.getElementById('gasKg').value = '';
            }

            document.getElementById('results').style.display = 'none';

            // Scroll to history to show the new entry
            setTimeout(() => {
                const historySection = document.querySelector('.history-section');
                if (historySection) {
                    historySection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }, 500);
        } else {
            alert('Failed to save emissions. Please try again.');
        }
    } catch (error) {
        console.error('Save Error:', error);
        alert('Server error while saving.');
    }
}
