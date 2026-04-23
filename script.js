// ==========================================
// 全局變數與數據初始化
// ==========================================
let allProjects = JSON.parse(localStorage.getItem('allProjects')) || {};
let currentProjectId = localStorage.getItem('currentProjectId') || null;
let currentRecordId = null; // 新增：當前選中的記錄ID
let cleaningRecords = [], projectSettings = {}, completionChart;
let isEditMode = false, projectSortAsc = true, recordSortAsc = true;
let lastProjectSortCol = 0, lastRecordSortCol = 0, currentGridData = null;
window.onload = init;
function init() {
    // 預設日期為今天 (如果該頁面有日期欄位)
    const dateInput = document.getElementById('recordDate');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    // 如果有選中的工程，載入數據
    if (currentProjectId && allProjects[currentProjectId]) {
        const pj = allProjects[currentProjectId];
        projectSettings = pj.settings;
        cleaningRecords = pj.records;
    }
    // 智能路由：根據當前頁面的 HTML 元素決定渲染內容
    if (document.getElementById('projectTableBody')) {
        // 母頁：工程管理
        renderProjectTable();
    }
    
    if (document.getElementById('current-project')) {
        // 子頁：進度記錄
        if (!currentProjectId) {
            alert('系統遺失當前工程資訊，將返回首頁！');
            window.location.href = 'index.html';
            return;
        }
        renderAllStatsAndRecords();
    }
}
// ==========================================
// 頁面跳轉與通用功能
// ==========================================
function goToPage(url) {
    if (!currentProjectId) {
        alert('請先在下方表格點選一個工程 (底色反白代表已選取)！');
        return;
    }
    window.location.href = url;
}
// ==========================================
// 彈窗功能 (備註與運作時間) - 保留原汁原味
// ==========================================
function showRemarkModal(text, chartData, imageBase64) {
    text = decodeURIComponent(text || '');
    imageBase64 = decodeURIComponent(imageBase64 || '');
    
    document.getElementById('remarkContent').innerText = text || '無備註';
    const chartBox = document.getElementById('remarkChart');
    chartBox.innerHTML = '';
    
    if (chartData) {
        try { chartData = JSON.parse(decodeURIComponent(chartData)); } catch (e) {}
        if (chartData) {
            const label = document.createElement('div');
            label.style.marginBottom = '8px';
            label.style.display = 'flex';
            label.style.gap = '12px';
            label.style.fontSize = '0.9em';
            label.innerHTML = `<span style="color:#2c6eec;"><i class="fas fa-square"></i> 已清洗</span><span style="color:#e74c3c;"><i class="fas fa-square"></i> 阻礙物</span><span style="color:#f39c12;"><i class="fas fa-square"></i> 未完成</span>`;
            chartBox.appendChild(label);
            const grid = document.createElement('div');
            grid.style.display = 'grid';
            grid.style.gap = '2px';
            grid.style.gridTemplateColumns = `40px repeat(${chartData.cols}, 30px)`;
            
            grid.appendChild(document.createElement('div'));
            for(let c=1; c<=chartData.cols; c++) {
                const colHeader = document.createElement('div');
                colHeader.innerText = chartData.streetCode ? `${chartData.streetCode}${c}` : c;
                colHeader.style.textAlign = 'center';
                colHeader.style.fontSize = '12px';
                grid.appendChild(colHeader);
            }
            
            for(let r=0; r<chartData.rows; r++) {
                const rowLabel = document.createElement('div');
                rowLabel.innerText = `F${chartData.rows - r}`;
                rowLabel.style.display = 'flex';
                rowLabel.style.alignItems = 'center';
                rowLabel.style.fontSize = '12px';
                grid.appendChild(rowLabel);
                for(let c=0; c<chartData.cols; c++) {
                    const cell = document.createElement('div');
                    cell.style.width = '30px';
                    cell.style.height = '20px';
                    cell.style.border = '1px solid #ccc';
                    const key = `${r}-${c}`;
                    if (chartData.cells[key]) {
                        if (chartData.cells[key] === 'clean') cell.style.backgroundColor = '#2c6eec';
                        else if (chartData.cells[key] === 'block') cell.style.backgroundColor = '#e74c3c';
                        else if (chartData.cells[key] === 'incomplete') cell.style.backgroundColor = '#f39c12';
                    }
                    grid.appendChild(cell);
                }
            }
            chartBox.appendChild(grid);
        }
    }
    
    const imgElement = document.getElementById('remarkImage');
    if (imageBase64) {
        imgElement.src = imageBase64;
        imgElement.style.display = 'block';
    } else {
        imgElement.style.display = 'none';
    }
    document.getElementById('remarkModal').style.display = 'flex';
}
function closeRemarkModal() { document.getElementById('remarkModal').style.display = 'none'; }
function showWorktimeModal(timesStr) {
    let times = [];
    try { times = JSON.parse(decodeURIComponent(timesStr)); } catch(e) {}
    let html = times.length > 0 ? times.map(t => `<div>${t.start} 至 ${t.end}</div>`).join('') : '無時間記錄';
    document.getElementById('worktimeContent').innerHTML = html;
    document.getElementById('worktimeModal').style.display = 'flex';
}
function closeWorktimeModal() { document.getElementById('worktimeModal').style.display = 'none'; }
// ==========================================
// 母頁：工程管理專用邏輯
// ==========================================
function openNewProjectModal() {
    isEditMode = false;
    document.querySelectorAll('#projectModal input').forEach(i => i.value = '');
    // 清空方向容器
    document.getElementById('directionsContainer').innerHTML = '';
    // 默认添加4个方向项，和原来的习惯一致，用户可以自行删改
    for(let i=0; i<4; i++) {
        addDirectionItem();
    }
    document.getElementById('projectModal').style.display = 'flex';
}
function openEditProjectModal() {
    if (!currentProjectId) return alert('請先點選一個工程！');
    isEditMode = true;
    const s = allProjects[currentProjectId].settings;
    document.getElementById('modalProjectName').value = allProjects[currentProjectId].name;
    document.getElementById('modalStartDate').value = s.startDate || '';
    document.getElementById('modalEndDate').value = s.endDate || '';
    
    // 清空方向容器
    document.getElementById('directionsContainer').innerHTML = '';
    
    // 处理新格式数据：有directions数组
    if(s.directions && s.directions.length > 0) {
        s.directions.forEach(dir => {
            addDirectionItem(dir);
        });
    } else {
        // 兼容旧格式数据：原来的四个方向
        const oldDirs = ['North','East','South','West'];
        const oldNames = ['北面','東面','南面','西面'];
        oldDirs.forEach((d, idx) => {
            const dirData = {
                name: s['street'+d] || oldNames[idx],
                area: s.totalAreas?.[d.toLowerCase()] || 0,
                cols: 6,
                rows:1,
                streetCode: ''
            };
            addDirectionItem(dirData);
        });
    }
    
    document.getElementById('projectModal').style.display = 'flex';
}
function closeModal() { document.getElementById('projectModal').style.display = 'none'; }
function saveProjectFromModal() {
    const name = document.getElementById('modalProjectName').value.trim();
    if (!name) return alert('請輸入項目名稱');
    
    // 收集所有方向項的數據
    const directions = [];
    document.querySelectorAll('.direction-item').forEach(item => {
        const dirName = item.querySelector('.dir-name').value.trim();
        const dirArea = parseFloat(item.querySelector('.dir-area').value) || 0;
        const dirCols = parseInt(item.querySelector('.dir-cols').value) || 6;
        const dirRows = parseInt(item.querySelector('.dir-rows').value) || 1;
        const dirCode = item.querySelector('.dir-code').value.trim();
        const gridData = JSON.parse(item.dataset.gridData || '{}');
        
        directions.push({
            name: dirName,
            area: dirArea,
            cols: dirCols,
            rows: dirRows,
            streetCode: dirCode,
            gridData: gridData
        });
    });
    
    const settings = {
        name,
        startDate: document.getElementById('modalStartDate').value,
        endDate: document.getElementById('modalEndDate').value,
        // 保留旧的字段，兼容旧数据
        streetNorth: directions[0]?.name || '',
        streetEast: directions[1]?.name || '',
        streetSouth: directions[2]?.name || '',
        streetWest: directions[3]?.name || '',
        totalAreas: {
            north: directions[0]?.area || 0,
            east: directions[1]?.area || 0,
            south: directions[2]?.area || 0,
            west: directions[3]?.area || 0
        },
        // 新的字段
        directions: directions
    };
    
    if (isEditMode) {
        allProjects[currentProjectId].settings = settings;
        allProjects[currentProjectId].name = name;
    } else {
        const id = 'pj_' + Date.now();
        allProjects[id] = { name, settings, records: [] };
        currentProjectId = id;
        localStorage.setItem('currentProjectId', id);
    }
    
    localStorage.setItem('allProjects', JSON.stringify(allProjects));
    closeModal();
    
    if (document.getElementById('projectTableBody')) {
        renderProjectTable();
    } else {
        location.reload();
    }
}
function deleteCurrentProject() {
    if (!currentProjectId || !confirm('確定要刪除此工程及其所有記錄？')) return;
    delete allProjects[currentProjectId];
    currentProjectId = null;
    localStorage.setItem('allProjects', JSON.stringify(allProjects));
    localStorage.removeItem('currentProjectId');
    if (document.getElementById('projectTableBody')) renderProjectTable();
}
function switchProjectId(id) {
    currentProjectId = id;
    localStorage.setItem('currentProjectId', id);
    if (document.getElementById('projectTableBody')) renderProjectTable();
}
function renderProjectTable(filter = '') {
    const tbody = document.getElementById('projectTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    Object.entries(allProjects).forEach(([id, pj]) => {
        const s = pj.settings;
        let totalArea;
        if(s.directions && s.directions.length >0) {
            totalArea = s.directions.reduce((t, d)=>t+(parseFloat(d.area)||0),0);
        } else {
            totalArea = Object.values(s.totalAreas).reduce((t,n)=>t+(parseFloat(n)||0),0);
        }
        const doneArea = pj.records.reduce((sum, r) => sum + (parseFloat(r.cleanArea)||0), 0);
        const rate = totalArea > 0 ? ((doneArea / totalArea)*100).toFixed(1) + '%' : '0%';
        if (filter && !`${pj.name} ${s.startDate}`.toLowerCase().includes(filter)) return;
        const tr = document.createElement('tr');
        tr.className = id === currentProjectId ? 'active' : '';
        tr.onclick = () => switchProjectId(id);
        tr.innerHTML = `
            <td>${pj.name}</td>
            <td>${s.startDate||'-'}</td>
            <td>${s.endDate||'-'}</td>
            <td>${pj.records.length}</td>
            <td>${totalArea}</td>
            <td>${rate}</td>
        `;
        tbody.appendChild(tr);
    });
}
function filterProjects() { renderProjectTable(document.getElementById('projectFilter').value.toLowerCase()); }
function sortProjects(colIndex) {
    const tbody = document.getElementById('projectTableBody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    if (lastProjectSortCol === colIndex) projectSortAsc = !projectSortAsc;
    else { projectSortAsc = true; lastProjectSortCol = colIndex; }
    rows.sort((a, b) => {
        let valA = a.cells[colIndex].innerText;
        let valB = b.cells[colIndex].innerText;
        if (colIndex >= 3) {
            valA = parseFloat(valA) || 0;
            valB = parseFloat(valB) || 0;
            return projectSortAsc ? valA - valB : valB - valA;
        }
        return projectSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
    rows.forEach(r => tbody.appendChild(r));
}
// ==========================================
// 子頁：記錄操作新功能
// ==========================================
function openRecordModal() {
    isEditMode = false;
    // 清空表單
    document.querySelectorAll('#recordModal input, #recordModal textarea, #recordModal select').forEach(i => i.value = '');
    document.getElementById('timePairsContainer').innerHTML = '';
    addTimePair(); // 初始化時間輸入
    currentGridData = null;
    document.getElementById('rangeGroupsContainer').innerHTML = '';
    document.getElementById('savedGridChart').style.display = 'none';
    document.getElementById('recordModalTitle').innerText = '新增記錄';
    document.getElementById('recordModal').style.display = 'flex';
    // 重置日期為今天
    document.getElementById('recordDate').value = new Date().toISOString().split('T')[0];
    // 初始化方向下拉框
    const directionSelect = document.getElementById('direction');
    directionSelect.innerHTML = '';
    if(projectSettings.directions && projectSettings.directions.length>0) {
        projectSettings.directions.forEach(dir => {
            const opt = document.createElement('option');
            opt.value = dir.name;
            opt.innerText = dir.name;
            directionSelect.appendChild(opt);
        });
    } else {
        // 兼容旧格式
        ['North','East','South','West'].forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.toLowerCase();
            opt.innerText = projectSettings['street'+d] || d;
            directionSelect.appendChild(opt);
        });
    }
    // 初始化示意圖預覽
    renderGrid();
}
function closeRecordModal() {
    document.getElementById('recordModal').style.display = 'none';
}
function openEditRecordModal() {
    if (!currentRecordId) return alert('請先點選一條記錄！');
    isEditMode = true;
    // 找到選中的記錄
    const record = cleaningRecords.find(r => r.id == currentRecordId);
    if (!record) return alert('找不到該記錄！');
    // 填充表單
    document.getElementById('recordDate').value = record.date;
    document.getElementById('direction').value = record.direction;
    document.getElementById('timeSlot').value = record.timeSlot;
    // 填充時間對
    document.getElementById('timePairsContainer').innerHTML = '';
    if (record.workTimes && record.workTimes.length > 0) {
        record.workTimes.forEach(t => {
            addTimePair();
            const rows = document.querySelectorAll('.time-pair-row');
            const lastRow = rows[rows.length -1];
            lastRow.querySelector('.start-time').value = t.start;
            lastRow.querySelector('.end-time').value = t.end;
        });
    } else {
        addTimePair();
    }
    document.getElementById('cleanScope').value = record.cleanScope;
    document.getElementById('lineCount').value = record.lineCount;
    document.getElementById('cleanArea').value = record.cleanArea;
    document.getElementById('waterUsage').value = record.waterUsage;
    document.getElementById('cleaningAgent').value = record.cleaningAgent;
    document.getElementById('operator').value = record.operator;
    document.getElementById('cleaningStaff').value = record.staff;
    document.getElementById('remark').value = record.remark;
    currentGridData = record.gridData;
    if (currentGridData) {
        // 填充原來的示意圖參數
        document.getElementById('gridCols').value = currentGridData.cols;
        document.getElementById('gridRows').value = currentGridData.rows;
        document.getElementById('streetCode').value = currentGridData.streetCode || '';
        // 清空區域組
        document.getElementById('rangeGroupsContainer').innerHTML = '';
        // 渲染預覽網格
        renderGrid();
        // 恢復原來的單元格狀態
        Object.entries(currentGridData.cells || {}).forEach(([key, val]) => {
            const [r,c] = key.split('-').map(Number);
            const cell = document.querySelector(`[data-r="${r}"][data-c="${c}"]`);
            if(cell) {
                if(val == 'clean') cell.classList.add('filled');
            }
        });
        renderSavedGridChart();
    } else {
        // 初始化預覽網格
        renderGrid();
        document.getElementById('savedGridChart').style.display = 'none';
    }
    document.getElementById('exampleImage').value = '';
    document.getElementById('recordModalTitle').innerText = '修改記錄';
    document.getElementById('recordModal').style.display = 'flex';
}
function deleteCurrentRecord() {
    if (!currentRecordId) return alert('請先點選一條記錄！');
    if (!confirm('確定要刪除此記錄？')) return;
    // 刪除記錄
    cleaningRecords = cleaningRecords.filter(r => r.id != currentRecordId);
    allProjects[currentProjectId].records = cleaningRecords;
    currentRecordId = null;
    localStorage.setItem('allProjects', JSON.stringify(allProjects));
    renderAllStatsAndRecords();
}
function switchRecordId(id) {
    currentRecordId = id;
    renderRecordsTable();
}
function showRecordDetail() {
    if (!currentRecordId) return alert('請先點選一條記錄！');
    const record = cleaningRecords.find(r => r.id == currentRecordId);
    if (!record) return alert('找不到該記錄！');
    // 填充詳情
    let detailHtml = `
        <div><strong>日期：</strong>${record.date || '-'}</div>
        <div><strong>面向街道：</strong>${record.directionText || '-'}</div>
        <div><strong>時間段：</strong>${record.timeSlot || '-'}</div>
        <div><strong>運作時間：</strong>${record.workTimes && record.workTimes.length>0 ? record.workTimes.map(t=>`${t.start} 至 ${t.end}`).join('、') : '無'}</div>
        <div><strong>清洗範圍：</strong>${record.cleanScope || '-'}</div>
        <div><strong>行數：</strong>${record.lineCount || '-'}</div>
        <div><strong>清洗面積：</strong>${record.cleanArea || 0} m²</div>
        <div><strong>用水量：</strong>${record.waterUsage || 0} ml</div>
        <div><strong>清潔劑：</strong>${record.cleaningAgent || 0} ml</div>
        <div><strong>操作員：</strong>${record.operator || '-'}</div>
        <div><strong>負責人：</strong>${record.staff || '-'}</div>
        <div><strong>備註：</strong>${record.remark || '無'}</div>
    `;
    document.getElementById('recordDetailContent').innerHTML = detailHtml;
    // 處理示意圖
    const chartBox = document.getElementById('recordDetailChart');
    chartBox.innerHTML = '';
    if (record.gridData) {
        const label = document.createElement('div');
        label.style.marginBottom = '8px';
        label.style.display = 'flex';
        label.style.gap = '12px';
        label.style.fontSize = '0.9em';
        label.innerHTML = `<span style="color:#2c6eec;"><i class="fas fa-square"></i> 已清洗</span><span style="color:#e74c3c;"><i class="fas fa-square"></i> 阻礙物</span><span style="color:#f39c12;"><i class="fas fa-square"></i> 未完成</span>`;
        chartBox.appendChild(label);
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gap = '2px';
        grid.style.gridTemplateColumns = `40px repeat(${record.gridData.cols}, 30px)`;
        
        grid.appendChild(document.createElement('div'));
        for(let c=1; c<=record.gridData.cols; c++) {
            const colHeader = document.createElement('div');
            colHeader.innerText = record.gridData.streetCode ? `${record.gridData.streetCode}${c}` : c;
            colHeader.style.textAlign = 'center';
            colHeader.style.fontSize = '12px';
            grid.appendChild(colHeader);
        }
        
        for(let r=0; r<record.gridData.rows; r++) {
            const rowLabel = document.createElement('div');
            rowLabel.innerText = `F${record.gridData.rows - r}`;
            rowLabel.style.display = 'flex';
            rowLabel.style.alignItems = 'center';
            rowLabel.style.fontSize = '12px';
            grid.appendChild(rowLabel);
            for(let c=0; c<record.gridData.cols; c++) {
                const cell = document.createElement('div');
                cell.style.width = '30px';
                cell.style.height = '20px';
                cell.style.border = '1px solid #ccc';
                const key = `${r}-${c}`;
                if (record.gridData.cells[key]) {
                    if (record.gridData.cells[key] === 'clean') cell.style.backgroundColor = '#2c6eec';
                    else if (record.gridData.cells[key] === 'block') cell.style.backgroundColor = '#e74c3c';
                    else if (record.gridData.cells[key] === 'incomplete') cell.style.backgroundColor = '#f39c12';
                }
                grid.appendChild(cell);
            }
        }
        chartBox.appendChild(grid);
    }
    // 處理圖片
    const imgElement = document.getElementById('recordDetailImage');
    if (record.image) {
        imgElement.src = record.image;
        imgElement.style.display = 'block';
    } else {
        imgElement.style.display = 'none';
    }
    // 顯示彈窗
    document.getElementById('recordDetailModal').style.display = 'flex';
}
function closeRecordDetailModal() {
    document.getElementById('recordDetailModal').style.display = 'none';
}
// 渲染已保存的示意圖預覽
function renderSavedGridChart() {
    if (!currentGridData) return;
    const container = document.getElementById('savedGridChart');
    container.innerHTML = '';
    container.style.display = 'block';
    
    const label = document.createElement('div');
    label.style.marginBottom = '8px';
    label.style.display = 'flex';
    label.style.gap = '12px';
    label.style.fontSize = '0.9em';
    label.innerHTML = `<span style="color:#2c6eec;"><i class="fas fa-square"></i> 已清洗</span><span style="color:#e74c3c;"><i class="fas fa-square"></i> 阻礙物</span><span style="color:#f39c12;"><i class="fas fa-square"></i> 未完成</span>`;
    container.appendChild(label);
    
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gap = '2px';
    grid.style.gridTemplateColumns = `40px repeat(${currentGridData.cols}, 30px)`;
    
    grid.appendChild(document.createElement('div'));
    for(let c=1; c<=currentGridData.cols; c++) {
        const colHeader = document.createElement('div');
        colHeader.innerText = currentGridData.streetCode ? `${currentGridData.streetCode}${c}` : c;
        colHeader.style.textAlign = 'center';
        colHeader.style.fontSize = '12px';
        grid.appendChild(colHeader);
    }
    
    for(let r=0; r<currentGridData.rows; r++) {
        const rowLabel = document.createElement('div');
        rowLabel.innerText = `F${currentGridData.rows - r}`;
        rowLabel.style.display = 'flex';
        rowLabel.style.alignItems = 'center';
        rowLabel.style.fontSize = '12px';
        grid.appendChild(rowLabel);
        for(let c=0; c<currentGridData.cols; c++) {
            const cell = document.createElement('div');
            cell.style.width = '30px';
            cell.style.height = '20px';
            cell.style.border = '1px solid #ccc';
            const key = `${r}-${c}`;
            if (currentGridData.cells[key]) {
                if (currentGridData.cells[key] === 'clean') cell.style.backgroundColor = '#2c6eec';
                else if (currentGridData.cells[key] === 'block') cell.style.backgroundColor = '#e74c3c';
                else if (currentGridData.cells[key] === 'incomplete') cell.style.backgroundColor = '#f39c12';
            }
            grid.appendChild(cell);
        }
    }
    container.appendChild(grid);
}
// ==========================================
// 子頁：進度記錄專用邏輯
// ==========================================
function renderAllStatsAndRecords() {
    const s = projectSettings;
    let totalArea;
    if(s.directions && s.directions.length>0) {
        totalArea = s.directions.reduce((t, d)=>t+(parseFloat(d.area)||0),0);
    } else {
        totalArea = Object.values(s.totalAreas).reduce((t,n)=>t+(parseFloat(n)||0),0);
    }
    const doneArea = cleaningRecords.reduce((sum, r) => sum + (parseFloat(r.cleanArea)||0), 0);
    const rate = totalArea > 0 ? ((doneArea / totalArea)*100).toFixed(1) : 0;
    // 更新頂部資訊與卡片
    document.getElementById('current-project').innerText = `項目：${s.name}`;
    document.getElementById('project-date-info').innerText = `(${s.startDate || '-'} 至 ${s.endDate || '-'})`;
    document.getElementById('total-area').innerText = `總面積：${totalArea.toFixed(1)} m²`;
    document.getElementById('overall-completion').innerText = `完成率：${rate}%`;
    document.getElementById('completedArea').innerText = doneArea.toFixed(1) + ' m²';
    document.getElementById('completionRate').innerText = rate + '%';
    document.getElementById('totalCleaningAgent').innerText = cleaningRecords.reduce((s, r) => s + (parseFloat(r.cleaningAgent)||0), 0).toFixed(1);
    // 更新方向下拉選單
    const dirSelect = document.getElementById('direction');
    if (dirSelect) {
        dirSelect.innerHTML = `
            <option value="north">${s.streetNorth || '北面'}</option>
            <option value="east">${s.streetEast || '東面'}</option>
            <option value="south">${s.streetSouth || '南面'}</option>
            <option value="west">${s.streetWest || '西面'}</option>
        `;
    }
    renderRecordsTable();
    initChart(totalArea, doneArea);
}
function addCleaningRecord() {
    const fileInput = document.getElementById('exampleImage');
    const file = fileInput && fileInput.files[0];
    const saveRecord = (imageBase64 = null) => {
        // 更新示意圖的參數
        if (currentGridData) {
            currentGridData.cols = parseInt(document.getElementById('gridCols').value) || 6;
            currentGridData.rows = parseInt(document.getElementById('gridRows').value) || 1;
            currentGridData.streetCode = document.getElementById('streetCode').value;
        }
        const timePairs = Array.from(document.querySelectorAll('.time-pair-row')).map(row => {
            return { start: row.querySelector('.start-time').value, end: row.querySelector('.end-time').value };
        }).filter(t => t.start || t.end);
        const record = {
            id: isEditMode ? currentRecordId : Date.now(),
            date: document.getElementById('recordDate').value,
            direction: document.getElementById('direction').value,
            directionText: document.getElementById('direction').options[document.getElementById('direction').selectedIndex].text,
            timeSlot: document.getElementById('timeSlot').value,
            workTimes: timePairs,
            cleanScope: document.getElementById('cleanScope').value,
            lineCount: document.getElementById('lineCount').value,
            cleanArea: parseFloat(document.getElementById('cleanArea').value) || 0,
            waterUsage: document.getElementById('waterUsage').value,
            cleaningAgent: parseFloat(document.getElementById('cleaningAgent').value) || 0,
            operator: document.getElementById('operator').value,
            staff: document.getElementById('cleaningStaff').value,
            remark: document.getElementById('remark').value,
            gridData: currentGridData,
            // 如果是編輯，沒有新圖片就保留原來的
            image: imageBase64 || (isEditMode ? cleaningRecords.find(r=>r.id==currentRecordId)?.image : null)
        };
        if (isEditMode) {
            // 更新記錄
            const index = cleaningRecords.findIndex(r => r.id == currentRecordId);
            if (index >= 0) {
                cleaningRecords[index] = record;
            }
        } else {
            // 新增記錄
            cleaningRecords.push(record);
        }
        allProjects[currentProjectId].records = cleaningRecords;
        localStorage.setItem('allProjects', JSON.stringify(allProjects));
        
        // 重置輸入
        currentGridData = null;
        document.getElementById('savedGridChart').style.display = 'none';
        if(fileInput) fileInput.value = '';
        document.getElementById('remark').value = '';
        
        closeRecordModal();
        renderAllStatsAndRecords();
    };
    if (file) {
        const reader = new FileReader();
        reader.onload = e => saveRecord(e.target.result);
        reader.readAsDataURL(file);
    } else {
        saveRecord();
    }
}
function renderRecordsTable(filter = '') {
    const tbody = document.getElementById('recordsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    cleaningRecords.forEach(r => {
        if (filter && !`${r.date} ${r.directionText} ${r.cleanArea} ${r.cleaningAgent} ${r.operator} ${r.staff}`.toLowerCase().includes(filter)) return;
        const tr = document.createElement('tr');
        tr.className = r.id === currentRecordId ? 'active' : '';
        tr.onclick = () => switchRecordId(r.id);
        const timesStr = encodeURIComponent(JSON.stringify(r.workTimes || []));
        const gridStr = encodeURIComponent(JSON.stringify(r.gridData || null));
        const imgStr = encodeURIComponent(r.image || '');
        const remarkStr = encodeURIComponent(r.remark || '');
        
        tr.innerHTML = `
            <td>${r.date}</td>
            <td>${r.directionText}</td>
            <td><button class="btn btn-sm" style="background:#e0e0e0;color:#333;" onclick="event.stopPropagation(); showWorktimeModal('${timesStr}')">查看</button></td>
            <td>${r.cleanArea}</td>
            <td>${r.cleaningAgent}</td>
            <td>${r.operator || '-'}</td>
            <td>${r.staff || '-'}</td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); showRemarkModal('${remarkStr}', '${gridStr}', '${imgStr}')">備註</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
// ==========================================
// 時間對與示意圖相關功能 (原有功能保留)
// ==========================================
function addTimePair() {
    const container = document.getElementById('timePairsContainer');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'time-pair-row';
    row.innerHTML = `
        <input type="time" class="start-time">
        <span>~</span>
        <input type="time" class="end-time">
    `;
    container.appendChild(row);
}
function renderGrid() {
    const cols = parseInt(document.getElementById('gridCols').value) || 6;
    const rows = parseInt(document.getElementById('gridRows').value) || 1;
    const streetCode = document.getElementById('streetCode').value;
    const container = document.getElementById('previewGrid');
    container.innerHTML = '';
    
    // 列標題
    const colRow = document.createElement('div');
    colRow.className = 'col-label-row';
    for(let c=1; c<=cols; c++) {
        const col = document.createElement('div');
        col.className = 'col-label';
        col.innerText = streetCode ? `${streetCode}${c}` : c;
        colRow.appendChild(col);
    }
    container.appendChild(colRow);
    
    // 行
    for(let r=0; r<rows; r++) {
        const gridRow = document.createElement('div');
        gridRow.className = 'grid-row';
        // 行標題
        const floorLabel = document.createElement('div');
        floorLabel.className = 'floor-label';
        floorLabel.innerText = `F${rows - r}`;
        gridRow.appendChild(floorLabel);
        // 單元格
        for(let c=0; c<cols; c++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.r = r;
            cell.dataset.c = c;
            cell.onclick = () => toggleCell(cell, r, c);
            gridRow.appendChild(cell);
        }
        container.appendChild(gridRow);
    }
    
    // 恢復之前的狀態
    if (currentGridData && currentGridData.cols == cols && currentGridData.rows == rows) {
        Object.entries(currentGridData.cells || {}).forEach(([key, val]) => {
            const [r,c] = key.split('-').map(Number);
            const cell = container.querySelector(`[data-r="${r}"][data-c="${c}"]`);
            if(cell) {
                cell.classList.remove('filled', 'block', 'incomplete');
                if(val == 'clean') cell.classList.add('filled');
                else if(val == 'block') cell.classList.add('block');
                else if(val == 'incomplete') cell.classList.add('incomplete');
            }
        });
    }
}
function toggleCell(cell, r, c) {
    if(!currentGridData) currentGridData = { cols:0, rows:0, cells: {}, streetCode:'' };
    const key = `${r}-${c}`;
    // 循環切換狀態：空 -> 已洗 -> 阻礙 -> 未完成 -> 空
    let currentState = currentGridData.cells[key] || null;
    cell.classList.remove('filled', 'block', 'incomplete');
    
    if(currentState === null) {
        // 空 -> 已洗
        currentGridData.cells[key] = 'clean';
        cell.classList.add('filled');
    } else if(currentState === 'clean') {
        // 已洗 -> 阻礙
        currentGridData.cells[key] = 'block';
        cell.classList.add('block');
    } else if(currentState === 'block') {
        // 阻礙 -> 未完成
        currentGridData.cells[key] = 'incomplete';
        cell.classList.add('incomplete');
    } else {
        // 未完成 -> 空
        delete currentGridData.cells[key];
    }
}
function addRangeGroup() {
    const container = document.getElementById('rangeGroupsContainer');
    const row = document.createElement('div');
    row.className = 'range-inputs';
    row.innerHTML = `
        <input type="number" placeholder="由下" min="1">
        <span>-</span>
        <input type="number" placeholder="至上" min="1">
        <input type="number" placeholder="由左" min="1">
        <span>-</span>
        <input type="number" placeholder="至右" min="1">
        <select>
            <option value="clean">已洗</option>
            <option value="block">阻礙</option>
            <option value="incomplete">未完成</option>
        </select>
        <button class="btn btn-sm btn-primary" onclick="applyRange(this)">應用</button>
        <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(row);
}
function applyRange(btn) {
    const inputs = btn.parentElement.querySelectorAll('input');
    const startRowInput = parseInt(inputs[0].value);
    const endRowInput = parseInt(inputs[1].value);
    const startColInput = parseInt(inputs[2].value);
    const endColInput = parseInt(inputs[3].value);
    const type = btn.parentElement.querySelector('select').value;
    
    const rows = parseInt(document.getElementById('gridRows').value) || 1;
    const cols = parseInt(document.getElementById('gridCols').value) || 6;
    
    // 轉換為r和c的索引：由下到上對應r的倒序，由左到右對應c的正序
    const startR = rows - startRowInput;
    const endR = rows - endRowInput;
    const startC = startColInput - 1;
    const endC = endColInput - 1;
    
    // 自動處理用戶輸入的順序，不管由下/至上誰大誰小，都能正確處理
    const minR = Math.min(startR, endR);
    const maxR = Math.max(startR, endR);
    const minC = Math.min(startC, endC);
    const maxC = Math.max(startC, endC);
    
    if(isNaN(minR) || isNaN(maxR) || isNaN(minC) || isNaN(maxC)) {
        return alert('請輸入正確的範圍！');
    }
    
    for(let r=minR; r<=maxR; r++) {
        for(let c=minC; c<=maxC; c++) {
            const cell = document.querySelector(`[data-r="${r}"][data-c="${c}"]`);
            if(cell) {
                const key = `${r}-${c}`;
                currentGridData.cells[key] = type;
                // 移除所有狀態，添加對應的
                cell.classList.remove('filled', 'block', 'incomplete');
                if(type == 'clean') cell.classList.add('filled');
                else if(type == 'block') cell.classList.add('block');
                else if(type == 'incomplete') cell.classList.add('incomplete');
            }
        }
    }
}
function saveGridChart() {
    currentGridData.cols = parseInt(document.getElementById('gridCols').value) || 6;
    currentGridData.rows = parseInt(document.getElementById('gridRows').value) || 1;
    currentGridData.streetCode = document.getElementById('streetCode').value;
    closeChartModal();
    renderSavedGridChart();
}
function initChart(total, done) {
    const ctx = document.getElementById('completionChart');
    if(!ctx) return;
    if(completionChart) completionChart.destroy();
    completionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['已完成', '未完成'],
            datasets: [{
                data: [done, total - done],
                backgroundColor: ['#28a745', '#e9ecef'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}
function filterRecords() { renderRecordsTable(document.getElementById('recordFilter').value.toLowerCase()); }
function sortRecords(colIndex) {
    const tbody = document.getElementById('recordsTableBody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    if (lastRecordSortCol === colIndex) recordSortAsc = !recordSortAsc;
    else { recordSortAsc = true; lastRecordSortCol = colIndex; }
    rows.sort((a, b) => {
        let valA = a.cells[colIndex].innerText;
        let valB = b.cells[colIndex].innerText;
        if (colIndex >= 3) {
            valA = parseFloat(valA) || 0;
            valB = parseFloat(valB) || 0;
            return recordSortAsc ? valA - valB : valB - valA;
        }
        return recordSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
    rows.forEach(r => tbody.appendChild(r));
}
// ==========================================
// 備份與匯入功能 (原有功能保留)
// ==========================================
function exportBackup() {
    const data = JSON.stringify(allProjects);
    const blob = new Blob([data], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cleaning-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}
function importBackup(event) {
    const file = event.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            allProjects = JSON.parse(e.target.result);
            localStorage.setItem('allProjects', JSON.stringify(allProjects));
            alert('匯入成功！');
            location.reload();
        } catch(err) {
            alert('匯入失敗，檔案格式錯誤！');
        }
    };
    reader.readAsText(file);
}
// ==========================================
// 動態方向項功能 (新增工程用)
// ==========================================
function addDirectionItem(directionData = null) {
    const container = document.getElementById('directionsContainer');
    if(!container) return; // 非工程頁面不執行
    const item = document.createElement('div');
    item.className = 'direction-item';
    item.style.border = '1px solid #eee';
    item.style.padding = '15px';
    item.style.borderRadius = '8px';
    item.style.marginBottom = '10px';
    
    // 如果有传入数据，就填充，否则默认值
    const name = directionData?.name || '';
    const area = directionData?.area || '';
    const cols = directionData?.cols || 6;
    const rows = directionData?.rows || 1;
    const code = directionData?.streetCode || '';
    
    item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span>方向設定</span>
            <button type="button" class="btn btn-sm btn-danger" onclick="removeDirectionItem(this)">刪除</button>
        </div>
        <div class="direction-area-row">
            <div class="form-group" style="flex:1;">
                <label>名稱</label>
                <input type="text" class="dir-name" placeholder="例如：北面" value="${name}">
            </div>
            <div class="form-group" style="flex:1;">
                <label>面積(m²)</label>
                <input type="number" class="dir-area" placeholder="0" value="${area}" oninput="updateTotalArea()">
            </div>
        </div>
        <div class="direction-area-row">
            <div class="form-group" style="flex:1;">
                <label>直行</label>
                <input type="number" class="dir-cols" value="${cols}" oninput="renderDirectionGrid(this)">
            </div>
            <div class="form-group" style="flex:1;">
                <label>橫行</label>
                <input type="number" class="dir-rows" value="${rows}" oninput="renderDirectionGrid(this)">
            </div>
            <div class="form-group" style="flex:1;">
                <label>街名代號</label>
                <input type="text" class="dir-code" value="${code}" oninput="renderDirectionGrid(this)">
            </div>
        </div>
        <div class="dir-grid-preview" style="margin-top:10px;">
            <div class="grid-canvas dir-grid-canvas"></div>
        </div>
    `;
    
    container.appendChild(item);
    
    // 渲染初始的网格
    renderDirectionGrid(item.querySelector('.dir-cols'));
    
    // 如果有传入的grid数据，恢复单元格状态
    if(directionData?.gridData) {
        const gridCanvas = item.querySelector('.dir-grid-canvas');
        Object.entries(directionData.gridData.cells || {}).forEach(([key, val]) => {
            const [r,c] = key.split('-').map(Number);
            const cell = gridCanvas.querySelector(`[data-r="${r}"][data-c="${c}"]`);
            if(cell) {
                if(val == 'clean') cell.classList.add('filled');
            }
        });
        // 把grid数据存在item的dataset里，方便保存的时候读取
        item.dataset.gridData = JSON.stringify(directionData.gridData);
    }
}

function removeDirectionItem(btn) {
    const item = btn.closest('.direction-item');
    item.remove();
    updateTotalArea();
}

function updateTotalArea() {
    // 實時更新總面積的邏輯，這裡暫不做前端顯示，保存時會自動計算
}

function renderDirectionGrid(input) {
    const item = input.closest('.direction-item');
    if(!item) return;
    const cols = parseInt(item.querySelector('.dir-cols').value) || 6;
    const rows = parseInt(item.querySelector('.dir-rows').value) || 1;
    const streetCode = item.querySelector('.dir-code').value || '';
    
    const gridCanvas = item.querySelector('.dir-grid-canvas');
    gridCanvas.innerHTML = '';
    
    // 列标签行
    const colLabelRow = document.createElement('div');
    colLabelRow.className = 'col-label-row';
    for(let c=1; c<=cols; c++) {
        const colLabel = document.createElement('div');
        colLabel.className = 'col-label';
        colLabel.innerText = streetCode ? `${streetCode}${c}` : c;
        colLabelRow.appendChild(colLabel);
    }
    gridCanvas.appendChild(colLabelRow);
    
    // 行和单元格
    for(let r=0; r<rows; r++) {
        const gridRow = document.createElement('div');
        gridRow.className = 'grid-row';
        
        // 行标签
        const rowLabel = document.createElement('div');
        rowLabel.className = 'floor-label';
        rowLabel.innerText = `F${rows - r}`;
        gridRow.appendChild(rowLabel);
        
        // 单元格
        for(let c=0; c<cols; c++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.r = r;
            cell.dataset.c = c;
            
            // 点击切换状态
            cell.onclick = function() {
                this.classList.toggle('filled');
                // 保存单元格状态到item的dataset里
                saveDirectionGridData(item);
            };
            
            gridRow.appendChild(cell);
        }
        gridCanvas.appendChild(gridRow);
    }
    
    // 保存初始的grid数据
    saveDirectionGridData(item);
}

function saveDirectionGridData(item) {
    const cols = parseInt(item.querySelector('.dir-cols').value) || 6;
    const rows = parseInt(item.querySelector('.dir-rows').value) || 1;
    const streetCode = item.querySelector('.dir-code').value || '';
    
    const cells = {};
    item.querySelectorAll('.grid-cell').forEach(cell => {
        const r = cell.dataset.r;
        const c = cell.dataset.c;
        if(cell.classList.contains('filled')) {
            cells[`${r}-${c}`] = 'clean';
        }
    });
    
    const gridData = {
        cols,
        rows,
        streetCode,
        cells
    };
    
    item.dataset.gridData = JSON.stringify(gridData);
}
