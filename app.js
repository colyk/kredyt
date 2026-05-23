
document.getElementById('startDate').value = new Date().toISOString().split('T')[0];

let debtChart;
let interestChart;
let savingsChart;
let latestScheduleRows = [];
let isFullScheduleVisible = false;
let selectedDownPaymentMode = '20';

const chartPalette = {
    base: '#315f82',
    monthly: '#24624f',
    yearly: '#a85e45',
    goal: '#b9832f',
    grid: 'rgba(36, 98, 79, .12)',
    tick: '#66736d'
};

function getChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false
        },
        plugins: {
            legend: {
                labels: {
                    color: chartPalette.tick,
                    usePointStyle: true,
                    pointStyle: 'circle',
                    boxWidth: 8,
                    boxHeight: 8
                }
            }
        },
        scales: {
            x: {
                grid: {
                    color: chartPalette.grid
                },
                ticks: {
                    color: chartPalette.tick,
                    maxRotation: 0,
                    autoSkipPadding: 24
                }
            },
            y: {
                grid: {
                    color: chartPalette.grid
                },
                ticks: {
                    color: chartPalette.tick,
                    callback: value => formatMoney(value).replace(' PLN', '')
                }
            }
        }
    };
}

function lineDataset(label, data, color, options = {}) {
    return {
        label,
        data,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 3,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: .32,
        ...options
    };
}

function monthlyInstallment(amount, monthlyRate, months) {

    if (!Number.isFinite(amount) || amount <= 0) {
        return 0;
    }

    if (!Number.isFinite(months) || months <= 0) {
        return 0;
    }

    if (monthlyRate === 0) {
        return amount / months;
    }

    return amount *
        (
            monthlyRate * Math.pow(1 + monthlyRate, months)
        )
        /
        (
            Math.pow(1 + monthlyRate, months) - 1
        );
}

function getNumber(id, fallback = 0) {
    const element = document.getElementById(id);

    if (!element) {
        return fallback;
    }

    const value = parseFloat(element.value);

    if (!Number.isFinite(value)) {
        return fallback;
    }

    return value;
}

function getMortgageInputs() {
    const propertyPrice = getNumber('propertyPrice');
    const downPayment = getSelectedDownPayment(propertyPrice);

    return {
        propertyPrice,
        downPayment,
        interest: getNumber('interestRate'),
        years: getNumber('years'),
        strategy: document.getElementById('strategy').value,
        monthlyOverpayment: getNumber('monthlyOverpayment'),
        yearlyOverpayment: getNumber('yearlyOverpayment'),
        yearlyMonth: parseInt(document.getElementById('yearlyMonth').value, 10) || 1,
        startDate: document.getElementById('startDate').value,
        currentSavings: getNumber('currentSavings'),
        monthlySavings: getNumber('monthlySavings')
    };
}

function getSelectedDownPayment(propertyPrice) {
    if (selectedDownPaymentMode === 'manual') {
        return getNumber('downPayment');
    }

    const percent = parseFloat(selectedDownPaymentMode);

    if (!Number.isFinite(percent) || propertyPrice <= 0) {
        return getNumber('downPayment');
    }

    return propertyPrice * percent / 100;
}

function syncDownPaymentInput(propertyPrice) {
    const input = document.getElementById('downPayment');

    if (!input || selectedDownPaymentMode === 'manual') {
        return;
    }

    input.value = Math.round(getSelectedDownPayment(propertyPrice));
}

function formatMoney(x) {
    if (!Number.isFinite(x)) {
        return "0 PLN";
    }

    return x.toLocaleString('pl-PL', {
        maximumFractionDigits: 0
    }) + " PLN";
}

function validateMortgageInputs(inputs) {
    const errors = [];

    if (inputs.propertyPrice <= 0) {
        errors.push('Cena nieruchomości musi być większa od zera.');
    }

    if (inputs.downPayment < 0) {
        errors.push('Wkład własny nie może być ujemny.');
    }

    if (inputs.propertyPrice > 0 && inputs.downPayment >= inputs.propertyPrice) {
        errors.push('Wkład własny musi być mniejszy niż cena nieruchomości.');
    }

    if (inputs.years <= 0) {
        errors.push('Okres kredytu musi być większy od zera.');
    }

    if (inputs.interest < 0) {
        errors.push('Oprocentowanie nie może być ujemne.');
    }

    return errors;
}

function showValidation(errors) {
    const box = document.getElementById('validationWarning');

    if (errors.length === 0) {
        box.classList.add('hidden');
        box.innerHTML = '';
        return;
    }

    box.classList.remove('hidden');
    box.innerHTML = errors.map(error => `<div>${error}</div>`).join('');
}

function calculateScenario(inputs, type) {
    const loanAmount = inputs.propertyPrice - inputs.downPayment;
    const monthlyRate = inputs.interest / 100 / 12;
    const totalMonths = Math.round(inputs.years * 12);
    const monthlyExtra = type === 'monthly' ? Math.max(inputs.monthlyOverpayment, 0) : 0;
    const yearlyExtra = type === 'yearly' ? Math.max(inputs.yearlyOverpayment, 0) : 0;
    const startDate = new Date(inputs.startDate);
    const safeStartDate = Number.isNaN(startDate.getTime()) ? new Date() : startDate;

    let payment = monthlyInstallment(loanAmount, monthlyRate, totalMonths);
    const initialPayment = payment;
    let balance = loanAmount;
    let month = 0;
    let totalInterest = 0;

    const balances = [];
    const interests = [];
    const labels = [];
    const rows = [];

    while (balance > 0.01 && month < totalMonths) {
        month++;

        const currentDate = new Date(safeStartDate);
        currentDate.setMonth(safeStartDate.getMonth() + month);

        const interestPart = balance * monthlyRate;
        let capitalPart = Math.min(payment - interestPart, balance);

        if (capitalPart < 0) {
            capitalPart = 0;
        }

        let extra = monthlyExtra;

        if (type === 'yearly' && currentDate.getMonth() + 1 === inputs.yearlyMonth) {
            extra += yearlyExtra;
        }

        extra = Math.min(extra, Math.max(balance - capitalPart, 0));
        balance = Math.max(balance - capitalPart - extra, 0);
        totalInterest += interestPart;

        balances.push(balance);
        interests.push(totalInterest);
        labels.push(
            currentDate.toLocaleDateString('pl-PL', {
                month: 'short',
                year: 'numeric'
            })
        );

        rows.push({
            date: currentDate.toLocaleDateString('pl-PL'),
            payment,
            capital: capitalPart,
            interest: interestPart,
            extra,
            balance
        });

        if (inputs.strategy === 'reduce' && balance > 0) {
            const remainingMonths = totalMonths - month;

            if (remainingMonths > 0) {
                payment = monthlyInstallment(
                    balance,
                    monthlyRate,
                    remainingMonths
                );
            }
        }
    }

    return {
        loanAmount,
        initialPayment,
        finalPayment: payment,
        totalInterest,
        months: month,
        balances,
        interests,
        labels,
        rows
    };
}

function renderSummary(base, monthly, yearly, inputs) {
    const downPaymentPercent = inputs.downPayment / inputs.propertyPrice * 100;
    const ltv = base.loanAmount / inputs.propertyPrice * 100;
    const warning = document.getElementById('downPaymentWarning');
    const end = new Date(inputs.startDate);
    const safeEnd = Number.isNaN(end.getTime()) ? new Date() : end;

    safeEnd.setMonth(safeEnd.getMonth() + base.months);

    document.getElementById('loanAmount').innerText =
        formatMoney(base.loanAmount);

    document.getElementById('monthlyPayment').innerText =
        formatMoney(base.initialPayment);

    document.getElementById('interestCost').innerText =
        formatMoney(base.totalInterest);

    document.getElementById('endDate').innerText =
        safeEnd.toLocaleDateString('pl-PL');

    document.getElementById('downPaymentPercent').innerText =
        `${formatMoney(inputs.downPayment)} (${downPaymentPercent.toFixed(1)}%)`;

    document.getElementById('ltv').innerText =
        ltv.toFixed(1) + '%';

    if (downPaymentPercent < 20) {
        warning.classList.remove('hidden');
        warning.innerText =
            'Wkład własny poniżej 20% może oznaczać dodatkowe koszty lub trudniejszą decyzję kredytową.';
    } else {
        warning.classList.add('hidden');
        warning.innerText = '';
    }
}

function renderComparison(base, monthly, yearly, inputs) {
    const savingsMonthly = base.totalInterest - monthly.totalInterest;
    const savingsYearly = base.totalInterest - yearly.totalInterest;
    const monthlyMonthsSaved = base.months - monthly.months;
    const yearlyMonthsSaved = base.months - yearly.months;
    const paymentLabel = inputs.strategy === 'reduce' ? 'Rata po zmianach' : 'Rata bazowa';
    const strategyNote = inputs.strategy === 'reduce'
        ? 'Tryb zmniejszania raty zakłada automatyczne przeliczenie raty po każdej nadpłacie.'
        : 'Tryb skracania okresu zostawia ratę na podobnym poziomie, a nadpłaty szybciej zmniejszają czas spłaty.';

    document.getElementById('comparisonBox').innerHTML = `

    <div class="comparison-grid">

        <div class="comparison-card good">
        <h3>Nadpłata miesięczna</h3>
        <div class="result-list">
            <div class="result-row">
                <span>Oszczędność odsetek</span>
                <span>${formatMoney(savingsMonthly)}</span>
            </div>
            <div class="result-row">
                <span>Skrócenie kredytu</span>
                <span>${monthlyMonthsSaved} mies.</span>
            </div>
            <div class="result-row">
                <span>${paymentLabel}</span>
                <span>${formatMoney(monthly.finalPayment)}</span>
            </div>
        </div>
        </div>

        <div class="comparison-card warn">
        <h3>Nadpłata roczna</h3>
        <div class="result-list">
            <div class="result-row">
                <span>Oszczędność odsetek</span>
                <span>${formatMoney(savingsYearly)}</span>
            </div>
            <div class="result-row">
                <span>Skrócenie kredytu</span>
                <span>${yearlyMonthsSaved} mies.</span>
            </div>
            <div class="result-row">
                <span>${paymentLabel}</span>
                <span>${formatMoney(yearly.finalPayment)}</span>
            </div>
        </div>
        </div>

    </div>

    <div class="note">
    ${strategyNote}
    </div>

    `;
}

function clearMortgageResults() {
    [
        'loanAmount',
        'monthlyPayment',
        'interestCost',
        'endDate',
        'downPaymentPercent',
        'ltv'
    ].forEach(id => {
        const element = document.getElementById(id);

        if (element) {
            element.innerText = '';
        }
    });

    document.getElementById('downPaymentWarning').classList.add('hidden');
    document.getElementById('comparisonBox').innerHTML = '';
    latestScheduleRows = [];
    renderTable([]);

    if (debtChart) {
        debtChart.destroy();
        debtChart = null;
    }

    if (interestChart) {
        interestChart.destroy();
        interestChart = null;
    }
}

function calculateDownPaymentPlan(inputs) {
    const propertyPrice = inputs.propertyPrice;
    const currentSavings = Math.max(inputs.currentSavings, 0);
    const monthlySavings = inputs.monthlySavings;
    const target = inputs.downPayment;
    const missing = Math.max(target - currentSavings, 0);
    const isPropertyPriceValid = propertyPrice > 0;
    const isTargetValid = Number.isFinite(target) && target > 0;
    let monthsToGoal = null;
    let targetDate = null;
    let warning = '';

    if (!isPropertyPriceValid) {
        warning = 'Podaj poprawną cenę nieruchomości, aby policzyć procenty wkładu własnego.';
    } else if (!isTargetValid) {
        warning = 'Podaj poprawny cel wkładu własnego.';
    } else if (missing === 0) {
        monthsToGoal = 0;
        targetDate = new Date();
    } else if (monthlySavings > 0) {
        monthsToGoal = Math.ceil(missing / monthlySavings);
        targetDate = new Date();
        targetDate.setMonth(targetDate.getMonth() + monthsToGoal);
    } else {
        warning = 'Nie da się wyliczyć terminu bez dodatniej kwoty miesięcznego oszczędzania.';
    }

    return {
        propertyPrice,
        currentSavings,
        monthlySavings,
        target,
        missing,
        monthsToGoal,
        targetDate,
        currentSavingsPercent: propertyPrice > 0 ? currentSavings / propertyPrice * 100 : 0,
        targetPercent: propertyPrice > 0 && Number.isFinite(target) ? target / propertyPrice * 100 : 0,
        isPropertyPriceValid,
        isTargetValid,
        isReached: isTargetValid && missing === 0,
        warning
    };
}

function renderDownPaymentPlan(plan) {
    const result = document.getElementById('downPaymentPlanResult');

    if (!plan.isPropertyPriceValid || !plan.isTargetValid) {
        result.innerHTML = `<div class="warn">${plan.warning}</div>`;
        return;
    }

    const timeText =
        plan.isReached
            ? 'Cel już osiągnięty'
            : plan.monthsToGoal === null
                ? 'Brak możliwości wyliczenia'
                : `${plan.monthsToGoal} miesięcy`;
    const dateText =
        plan.targetDate
            ? plan.targetDate.toLocaleDateString('pl-PL')
            : '-';

    result.innerHTML = `
        <div class="result-list">
            <div class="result-row">
                <span>Docelowy wkład własny</span>
                <span>${formatMoney(plan.target)}</span>
            </div>
            <div class="result-row">
                <span>Jako część ceny domu</span>
                <span>${plan.targetPercent.toFixed(1)}%</span>
            </div>
            <div class="result-row">
                <span>Już mamy</span>
                <span>${formatMoney(plan.currentSavings)}</span>
            </div>
            <div class="result-row">
                <span>Brakuje jeszcze</span>
                <span>${formatMoney(plan.missing)}</span>
            </div>
            <div class="result-row">
                <span>Czas do osiągnięcia celu</span>
                <span>${timeText}</span>
            </div>
            <div class="result-row">
                <span>Przewidywana data osiągnięcia celu</span>
                <span>${dateText}</span>
            </div>
        </div>
        ${plan.warning ? `<div class="warn" style="margin-top:15px;">${plan.warning}</div>` : ''}
    `;
}

function renderSavingsChart(plan) {
    const ctx = document.getElementById('savingsChart');

    if (savingsChart) {
        savingsChart.destroy();
        savingsChart = null;
    }

    if (!plan.isPropertyPriceValid || !plan.isTargetValid || typeof Chart === 'undefined') {
        return;
    }

    const months = plan.isReached ? 1 : plan.monthsToGoal === null ? 0 : Math.max(plan.monthsToGoal, 1);
    const labels = [];
    const savings = [];

    for (let month = 0; month <= months; month++) {
        labels.push(`${month} mies.`);
        savings.push(
            Math.min(
                plan.currentSavings + Math.max(plan.monthlySavings, 0) * month,
                plan.target
            )
        );
    }

    savingsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                lineDataset('Oszczędności', savings, chartPalette.monthly),
                lineDataset(
                    'Cel wkładu własnego',
                    labels.map(() => plan.target),
                    chartPalette.goal,
                    {
                        borderDash: [8, 7],
                        borderWidth: 2
                    }
                )
            ]
        },
        options: getChartOptions()
    });
}

function calculate() {
    syncDownPaymentInput(getNumber('propertyPrice'));

    const inputs = getMortgageInputs();
    const errors = validateMortgageInputs(inputs);
    const downPaymentPlan = calculateDownPaymentPlan(inputs);

    showValidation(errors);
    renderDownPaymentPlan(downPaymentPlan);
    renderSavingsChart(downPaymentPlan);

    if (errors.length > 0) {
        clearMortgageResults();
        return;
    }

    const base = calculateScenario(inputs, 'none');
    const monthly = calculateScenario(inputs, 'monthly');
    const yearly = calculateScenario(inputs, 'yearly');

    renderSummary(base, monthly, yearly, inputs);
    renderComparison(base, monthly, yearly, inputs);
    renderDebtChart(base, monthly, yearly);
    renderInterestChart(base, monthly, yearly);
    latestScheduleRows = monthly.rows;
    renderTable(latestScheduleRows);
}

function renderDebtChart(base, monthly, yearly) {

    const ctx =
        document.getElementById('debtChart');

    if (debtChart) {
        debtChart.destroy();
    }

    if (typeof Chart === 'undefined') {
        return;
    }

    debtChart = new Chart(ctx, {

        type: 'line',

        data: {
            labels: base.labels,

            datasets: [

                lineDataset('Bez nadpłat', base.balances, chartPalette.base),

                lineDataset('Nadpłata miesięczna', monthly.balances, chartPalette.monthly),

                lineDataset('Nadpłata roczna', yearly.balances, chartPalette.yearly)

            ]
        },

        options: getChartOptions()

    });
}

function renderInterestChart(base, monthly, yearly) {

    const ctx =
        document.getElementById('interestChart');

    if (interestChart) {
        interestChart.destroy();
    }

    if (typeof Chart === 'undefined') {
        return;
    }

    interestChart = new Chart(ctx, {

        type: 'line',

        data: {
            labels: base.labels,

            datasets: [

                lineDataset('Bez nadpłat', base.interests, chartPalette.base),

                lineDataset('Nadpłata miesięczna', monthly.interests, chartPalette.monthly),

                lineDataset('Nadpłata roczna', yearly.interests, chartPalette.yearly)

            ]
        },

        options: getChartOptions()

    });
}

function renderTable(rows) {

    const body =
        document.getElementById('scheduleBody');
    const visibleRows = isFullScheduleVisible ? rows : rows.slice(0, 12);

    body.innerHTML = visibleRows.map(r => `

        <tr>

        <td class="left">${r.date}</td>

        <td>${formatMoney(r.payment)}</td>

        <td>${formatMoney(r.capital)}</td>

        <td>${formatMoney(r.interest)}</td>

        <td>${formatMoney(r.extra)}</td>

        <td>${formatMoney(r.balance)}</td>

        </tr>

        `
    ).join('');

    updateScheduleToggle(rows.length);
}

function updateScheduleToggle(totalRows) {
    const button = document.getElementById('scheduleToggle');

    if (!button) {
        return;
    }

    if (totalRows <= 12) {
        button.classList.add('hidden');
        return;
    }

    button.classList.remove('hidden');
    button.innerText = isFullScheduleVisible
        ? 'Pokaż pierwsze 12 miesięcy'
        : `Pokaż cały harmonogram (${totalRows} mies.)`;
}

function activateChartTab(tabName) {
    document.querySelectorAll('[data-chart-tab]').forEach(button => {
        button.classList.toggle('active', button.dataset.chartTab === tabName);
    });

    document.querySelectorAll('[data-chart-panel]').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.chartPanel === tabName);
    });

    [debtChart, savingsChart, interestChart].forEach(chart => {
        if (chart) {
            chart.resize();
        }
    });
}

document.querySelectorAll('input, select').forEach(element => {
    if (element.id === 'downPayment') {
        return;
    }

    element.addEventListener('input', calculate);
    element.addEventListener('change', calculate);
});

document.getElementById('downPayment').addEventListener('input', () => {
    selectedDownPaymentMode = 'manual';
    updateDownPaymentChoice();
    calculate();
});

document.querySelectorAll('[data-down-payment-mode]').forEach(button => {
    button.addEventListener('click', () => {
        selectedDownPaymentMode = button.dataset.downPaymentMode;
        updateDownPaymentChoice();
        calculate();
    });
});

document.querySelectorAll('[data-chart-tab]').forEach(button => {
    button.addEventListener('click', () => {
        activateChartTab(button.dataset.chartTab);
    });
});

document.getElementById('scheduleToggle').addEventListener('click', () => {
    isFullScheduleVisible = !isFullScheduleVisible;
    renderTable(latestScheduleRows);
});

function updateDownPaymentChoice() {
    document.querySelectorAll('[data-down-payment-mode]').forEach(button => {
        button.classList.toggle(
            'active',
            button.dataset.downPaymentMode === selectedDownPaymentMode
        );
    });
}

updateDownPaymentChoice();
calculate();
