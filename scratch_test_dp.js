const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<style>
.ddmmyy-date-wrap { position: relative; display: flex; width: 250px; }
.ddmmyy-native-picker {
    position: absolute; right: 0; bottom: 0; width: 1px; height: 1px; opacity: 0; border: none; padding: 0;
}
</style>
</head>
<body>
<div class="ddmmyy-date-wrap">
    <input type="text" id="textInput" class="ddmmyy-input">
    <button id="btn" onclick="openPicker()">📅</button>
    <input type="date" id="nativeInput" class="ddmmyy-native-picker" onchange="sync(this)" oninput="sync(this)">
</div>
<script>
let isSyncing = false;
function openPicker() {
    const ni = document.getElementById('nativeInput');
    ni.focus();
    ni.showPicker();
}
function sync(el) {
    if (isSyncing) return;
    const val = el.value;
    if (!val || val.length < 10) return;
    isSyncing = true;
    console.log('SYNC FIRED:', val);
    document.getElementById('textInput').value = val;
    try { el.blur(); } catch(e){}
    try {
        el.type = 'text';
        el.type = 'date';
        el.value = val;
    } catch(e){}
    document.getElementById('textInput').focus();
    setTimeout(() => { isSyncing = false; }, 100);
}
</script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(htmlContent);
});

server.listen(9876, () => {
    console.log('Server running on 9876');
});
