const elements = {
    status: document.getElementById('status'),
    scanButton: document.getElementById('scanButton'),
    writeButton: document.getElementById('writeButton'),
    clearLogButton: document.getElementById('clearLogButton'),
    log: document.getElementById('log'),
    recordTypeSelect: document.getElementById('recordTypeSelect'),
    textInput: document.getElementById('textInput'),
    jsonInput: document.getElementById('jsonInput'),
    wifiInputs: document.getElementById('wifiInputs'),
    wifiSSID: document.getElementById('wifiSSID'),
    wifiPassword: document.getElementById('wifiPassword'),
    wifiAuthType: document.getElementById('wifiAuthType'),
};
const initialLogText = '读取到的内容将显示在这里...';

const updateStatus = (message, type = 'info') => {
    elements.status.textContent = message;
    elements.status.className = `status-box ${type}`;
};

if (!('NDEFReader' in window)) {
    updateStatus('此浏览器不支持 Web NFC！', 'error');
    Object.values(elements).forEach(el => { if(el && el.id !== 'status') el.disabled = true; });
} else {
    elements.scanButton.addEventListener('click', handleScan);
    elements.writeButton.addEventListener('click', handleWrite);
    elements.clearLogButton.addEventListener('click', () => {
        elements.log.innerHTML = initialLogText;
        updateStatus('日志已清空');
    });
    elements.recordTypeSelect.addEventListener('change', handleRecordTypeChange);
}

async function handleScan() {
    updateStatus('扫描已启动，请将NFC标签靠近手机背面...', 'loading');
    try {
        const reader = new NDEFReader();
        await reader.scan();
        reader.addEventListener('error', event => {
            updateStatus(`扫描时发生错误: ${event.message || '未知错误'}`, 'error');
        });
        reader.addEventListener('reading', ({ message, serialNumber }) => {
            updateStatus('读取成功！', 'success');
            renderReadDataWithDebug(message, serialNumber);
        });
    } catch (error) {
        updateStatus(`启动扫描失败: ${error}`, 'error');
    }
}

function renderReadDataWithDebug(message, serialNumber) {
    elements.log.innerHTML = '正在处理数据... 请稍候...';
    console.log("NFC Read Event Fired. Raw Message Object:", message);
    try {
        let logOutput = `> 标签序列号: ${serialNumber || 'N/A'}
`;
        if (!message.records || message.records.length === 0) {
            logOutput += '> 标签为空或不包含可识别的NDEF记录。';
            elements.log.innerHTML = logOutput;
            return;
        }
        for (const record of message.records) {
            logOutput += `> 记录类型: ${record.recordType}
`;
            logOutput += `> MIME 类型: ${record.mediaType || 'N/A'}
`;
            if (!record.data) {
                logOutput += `> 内容: [记录无数据]
`;
                continue;
            }
            if (record.recordType === "mime" && record.mediaType === "application/vnd.wfa.wsc") {
                logOutput += `> 内容: [这是一个Wi-Fi配置记录]
`;
                continue;
            }
            const textDecoder = new TextDecoder(record.encoding || 'utf-8');
            const text = textDecoder.decode(record.data);
            if (record.recordType === "url" || (record.recordType === "text" && text.includes('://'))) {
                 logOutput += `> 内容: <a href="${text}" target="_blank" rel="noopener noreferrer">${text}</a>
`;
            } else if (record.mediaType === 'application/json') {
                try {
                    const jsonObj = JSON.parse(text);
                    logOutput += `> JSON 内容:
${JSON.stringify(jsonObj, null, 2)}
`;
                } catch {
                    logOutput += `> 内容 (非标准JSON): ${text}
`;
                }
            } else {
                logOutput += `> 内容: ${text}
`;
            }
        }
        elements.log.innerHTML = logOutput;
    } catch (err) {
        updateStatus('处理数据时发生内部错误！', 'error');
        elements.log.innerHTML = `在渲染数据时捕获到错误：
- 错误名称: ${err.name}
- 错误信息: ${err.message}
请将此信息截图反馈。`;
        console.error("Error caught inside renderReadDataWithDebug:", err);
    }
}

async function handleWrite() {
    const recordType = elements.recordTypeSelect.value;
    let records = [];
    try {
        switch(recordType) {
            case 'text':
                const text = elements.textInput.value;
                if (!text) throw new Error("文本内容不能为空！");
                records.push({ recordType: "text", data: text });
                break;
            case 'url':
                const url = elements.textInput.value;
                if (!url) throw new Error("URL不能为空！");
                records.push({ recordType: "url", data: url });
                break;
            case 'json':
                const jsonString = elements.jsonInput.value;
                if (!jsonString) throw new Error("JSON内容不能为空！");
                JSON.parse(jsonString);
                records.push({ recordType: "mime", mediaType: "application/json", data: jsonString });
                break;
            case 'wifi':
                const ssid = elements.wifiSSID.value;
                const password = elements.wifiPassword.value;
                const authType = elements.wifiAuthType.value;
                if (!ssid) throw new Error("Wi-Fi名称(SSID)不能为空！");
                const wifiConfigString = `WIFI:T:${authType};S:${ssid};P:${password};;`;
                records.push({ recordType: "text", data: wifiConfigString });
                break;
            case 'empty':
                records.push({ recordType: "empty" });
                break;
        }
    } catch (error) {
        updateStatus(error.message.includes('JSON') ? 'JSON格式无效！' : error.message, 'error');
        return;
    }
    const actionText = recordType === 'empty' ? '清空' : '写入';
    updateStatus(`准备${actionText}，请将NFC标签靠近手机背面...`, 'loading');
    try {
        const writer = new NDEFReader();
        const message = (recordType === 'empty') ? { records: [{ recordType: "empty" }] } : { records: records };
        await writer.write(message);
        updateStatus(`${actionText}成功！`, 'success');
    } catch (error) {
        updateStatus(`${actionText}失败: ${error}`, 'error');
    }
}

function handleRecordTypeChange() {
    const recordType = elements.recordTypeSelect.value;
    elements.textInput.style.display = 'none';
    elements.jsonInput.style.display = 'none';
    elements.wifiInputs.style.display = 'none';
    elements.writeButton.style.display = 'block';
    switch(recordType) {
        case 'text':
        case 'url':
            elements.textInput.style.display = 'block';
            elements.textInput.type = 'text';
            elements.textInput.placeholder = recordType === 'url'
                ? '例如: baidu.com 或 http://192.168.1.1'
                : '在此输入要写入的文本内容';
            break;
        case 'json':
            elements.jsonInput.style.display = 'block';
            break;
        case 'wifi':
            elements.wifiInputs.style.display = 'flex';
            break;
    }
    const selectedOptionText = elements.recordTypeSelect.options[elements.recordTypeSelect.selectedIndex].text;
    elements.writeButton.textContent = recordType === 'empty' ? '确认清空标签' : '写入标签';
    updateStatus(`已切换到“${selectedOptionText}”模式`);
}