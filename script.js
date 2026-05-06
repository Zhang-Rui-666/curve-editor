/**
 * 多曲线编辑器 - 每个控制点可独立调整斜率（切线控制柄）
 * 采用 Hermite 插值，转换为三次贝塞尔曲线。
 * 每个点存储：{x, y, tx, ty} 其中 (tx,ty) 为切线向量（从点指向控制柄末端）
 */

(function() {
    // ---------- DOM 元素 ----------
    const canvas = document.getElementById('curveCanvas');
    const ctx = canvas.getContext('2d');
    const curveSelect = document.getElementById('curveSelect');
    const addCurveBtn = document.getElementById('addCurveBtn');
    const delCurveBtn = document.getElementById('delCurveBtn');
    const clearPointsBtn = document.getElementById('clearPointsBtn');
    const saveBtn = document.getElementById('saveBtn');

    // 画布尺寸固定
    const width = 900, height = 550;
    canvas.width = width;
    canvas.height = height;

    // ---------- 数据结构 ----------
    let curves = [];            // 存储所有曲线对象
    let currentCurveIndex = 0; // 当前编辑的曲线索引
    let nextCurveId = 1;

    // 交互状态
    let dragType = null;        // 'point', 'tangent'
    let dragTarget = null;      // { curveIdx, pointIdx } 或 { curveIdx, pointIdx }
    let isDragging = false;
    let startMouse = { x: 0, y: 0 };

    // 视觉常量
    const POINT_RADIUS = 6;
    const TANGENT_HANDLE_RADIUS = 5;
    const TANGENT_LINE_LEN = 50;  // 切线手柄初始长度（像素），实际根据切线向量动态变化

    // 辅助：生成随机颜色（每条曲线不同）
    function getCurveColor(index) {
        const hue = (index * 137) % 360; // 黄金角近似
        return `hsl(${hue}, 65%, 55%)`;
    }

    // 创建一个新曲线对象
    function createCurve(name = null) {
        const id = nextCurveId++;
        return {
            id: id,
            name: name || `曲线 ${id}`,
            points: [],      // 每个元素 {x, y, tx, ty}
            color: getCurveColor(curves.length)
        };
    }

    // 为曲线添加一个控制点（默认切线方向为水平向右，长度30）
    function addPointToCurve(curve, x, y) {
        // 避免过近重叠
        if (curve.points.some(p => Math.hypot(p.x - x, p.y - y) < POINT_RADIUS * 1.5)) return false;
        // 默认切线方向：从该点指向右偏下 (dx=30, dy=10) 作为初始，避免零向量
        const defaultTx = 30;
        const defaultTy = 10;
        curve.points.push({ x, y, tx: defaultTx, ty: defaultTy });
        return true;
    }

    // 更新下拉菜单的选项
    function updateCurveSelect() {
        curveSelect.innerHTML = '';
        curves.forEach((curve, idx) => {
            const option = document.createElement('option');
            option.value = idx;
            option.textContent = `${curve.name} (${curve.points.length}点)`;
            if (idx === currentCurveIndex) option.selected = true;
            curveSelect.appendChild(option);
        });
        if (curves.length === 0) {
            const option = document.createElement('option');
            option.text = '无曲线，请新建';
            curveSelect.appendChild(option);
        }
    }

    // 切换当前曲线
    function setCurrentCurve(index) {
        if (index >= 0 && index < curves.length) {
            currentCurveIndex = index;
            updateCurveSelect();
            redraw();
        }
    }

    // 删除当前曲线
    function deleteCurrentCurve() {
        if (curves.length <= 1) {
            alert("至少保留一条曲线");
            return;
        }
        curves.splice(currentCurveIndex, 1);
        if (currentCurveIndex >= curves.length) currentCurveIndex = curves.length - 1;
        updateCurveSelect();
        redraw();
    }

    // 清空当前曲线的所有点
    function clearCurrentCurvePoints() {
        if (curves[currentCurveIndex]) {
            curves[currentCurveIndex].points = [];
            redraw();
        }
    }

    // ---------- 绘图辅助：网格 ----------
    function drawGrid() {
        ctx.save();
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 0.8;
        const step = 25;
        for (let x = step; x < width; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = step; y < height; y += step) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    // 绘制单条曲线 (Hermite->Bezier)
    function drawCurve(curve) {
        const points = curve.points;
        if (points.length < 2) return;
        ctx.save();
        ctx.strokeStyle = curve.color;
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();

        // 对于每段 [P_i, P_{i+1}], 使用切线向量构造三次贝塞尔曲线
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i];
            const p1 = points[i+1];
            // 切线向量（从点指向手柄末端），实际导数方向即该向量方向，其长度影响曲线弯曲程度
            // 贝塞尔控制点：C0 = p0, C3 = p1
            // C1 = p0 + (tx0)/3,   C2 = p1 - (tx1)/3
            const cp1x = p0.x + p0.tx / 3;
            const cp1y = p0.y + p0.ty / 3;
            const cp2x = p1.x - p1.tx / 3;
            const cp2y = p1.y - p1.ty / 3;

            if (i === 0) ctx.moveTo(p0.x, p0.y);
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p1.x, p1.y);
        }
        ctx.stroke();
        ctx.restore();
    }

    // 绘制控制点及切线手柄（所有曲线都绘制，但当前曲线高亮显示）
    function drawHandles() {
        for (let cIdx = 0; cIdx < curves.length; cIdx++) {
            const curve = curves[cIdx];
            const isCurrent = (cIdx === currentCurveIndex);
            for (let i = 0; i < curve.points.length; i++) {
                const p = curve.points[i];
                // 绘制切线辅助线（虚线）和 手柄端点
                const handleX = p.x + p.tx;
                const handleY = p.y + p.ty;
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(handleX, handleY);
                ctx.strokeStyle = isCurrent ? "#c44569" : "#aaa";
                ctx.setLineDash([5, 5]);
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.setLineDash([]);
                // 手柄端点圆
                ctx.beginPath();
                ctx.arc(handleX, handleY, TANGENT_HANDLE_RADIUS, 0, 2*Math.PI);
                ctx.fillStyle = isCurrent ? "#c44569" : "#b0b0b0";
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 1;
                ctx.stroke();
                
                // 绘制控制点
                ctx.beginPath();
                ctx.arc(p.x, p.y, POINT_RADIUS, 0, 2*Math.PI);
                ctx.fillStyle = isCurrent ? "#ff7e5e" : "#9e9e9e";
                ctx.fill();
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 2;
                ctx.stroke();
                // 内圈高光
                ctx.beginPath();
                ctx.arc(p.x, p.y, POINT_RADIUS-2, 0, 2*Math.PI);
                ctx.fillStyle = isCurrent ? "#f9a66c" : "#c0c0c0";
                ctx.fill();
                ctx.restore();
            }
        }
    }

    // 全局重绘
    function redraw() {
        ctx.clearRect(0, 0, width, height);
        drawGrid();
        // 绘制所有曲线
        for (let curve of curves) {
            drawCurve(curve);
        }
        drawHandles();
    }

    // ---------- 坐标转换与命中测试 ----------
    function getMouseCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        let clientX, clientY;
        if (e.touches) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        let x = (clientX - rect.left) * scaleX;
        let y = (clientY - rect.top) * scaleY;
        x = Math.min(Math.max(0, x), width);
        y = Math.min(Math.max(0, y), height);
        return { x, y };
    }

    // 检测命中的对象: 优先切线手柄，再控制点
    function hitTest(mx, my) {
        // 遍历所有曲线的所有点（从上往下，近的优先，这里简单按数组顺序）
        for (let cIdx = 0; cIdx < curves.length; cIdx++) {
            const curve = curves[cIdx];
            for (let pIdx = 0; pIdx < curve.points.length; pIdx++) {
                const p = curve.points[pIdx];
                const hx = p.x + p.tx;
                const hy = p.y + p.ty;
                const distToHandle = Math.hypot(mx - hx, my - hy);
                if (distToHandle <= TANGENT_HANDLE_RADIUS + 5) {
                    return { type: 'tangent', curveIdx: cIdx, pointIdx: pIdx };
                }
                const distToPoint = Math.hypot(mx - p.x, my - p.y);
                if (distToPoint <= POINT_RADIUS + 5) {
                    return { type: 'point', curveIdx: cIdx, pointIdx: pIdx };
                }
            }
        }
        return null;
    }

    // ---------- 交互事件 ----------
    function onMouseDown(e) {
        e.preventDefault();
        const { x, y } = getMouseCoords(e);
        const hit = hitTest(x, y);
        if (hit) {
            dragType = hit.type;
            dragTarget = { curveIdx: hit.curveIdx, pointIdx: hit.pointIdx };
            isDragging = true;
            startMouse = { x, y };
            // 如果点击的不是当前曲线，自动切换
            if (hit.curveIdx !== currentCurveIndex) {
                setCurrentCurve(hit.curveIdx);
            }
            canvas.style.cursor = dragType === 'point' ? 'grabbing' : 'crosshair';
            return;
        }
        // 空白处添加控制点到当前曲线
        if (curves.length > 0) {
            const curve = curves[currentCurveIndex];
            addPointToCurve(curve, x, y);
            redraw();
            updateCurveSelect();
        }
    }

    function onMouseMove(e) {
        if (!isDragging || !dragTarget) return;
        e.preventDefault();
        const { x, y } = getMouseCoords(e);
        const curve = curves[dragTarget.curveIdx];
        if (!curve) return;
        const point = curve.points[dragTarget.pointIdx];
        if (dragType === 'point') {
            // 移动控制点
            point.x = x;
            point.y = y;
            redraw();
        } else if (dragType === 'tangent') {
            // 修改切线向量：手柄末端的新位置相对于点坐标
            let newTx = x - point.x;
            let newTy = y - point.y;
            // 限制最小长度防止零向量，长度也可以限制范围但不必须
            if (Math.hypot(newTx, newTy) < 1) {
                newTx = 1; newTy = 0;
            }
            point.tx = newTx;
            point.ty = newTy;
            redraw();
        }
        canvas.style.cursor = 'grabbing';
    }

    function onMouseUp(e) {
        if (isDragging) {
            isDragging = false;
            dragType = null;
            dragTarget = null;
            canvas.style.cursor = 'crosshair';
            redraw();
        }
    }

    function onMouseLeave(e) {
        if (isDragging) {
            isDragging = false;
            dragType = null;
            dragTarget = null;
            canvas.style.cursor = 'crosshair';
            redraw();
        }
    }

    // ---------- 按钮功能 ----------
    function addNewCurve() {
        const newCurve = createCurve();
        curves.push(newCurve);
        currentCurveIndex = curves.length - 1;
        updateCurveSelect();
        redraw();
    }

    function saveAsImage() {
        const link = document.createElement('a');
        link.download = 'curve_editor.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    // ---------- 事件绑定 ----------
    function initEvents() {
        canvas.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('mouseleave', onMouseLeave);
        // 触摸事件简单支持
        canvas.addEventListener('touchstart', onMouseDown);
        window.addEventListener('touchmove', onMouseMove);
        window.addEventListener('touchend', onMouseUp);
        canvas.addEventListener('touchcancel', onMouseLeave);

        curveSelect.addEventListener('change', (e) => {
            setCurrentCurve(parseInt(e.target.value));
        });
        addCurveBtn.addEventListener('click', addNewCurve);
        delCurveBtn.addEventListener('click', deleteCurrentCurve);
        clearPointsBtn.addEventListener('click', clearCurrentCurvePoints);
        saveBtn.addEventListener('click', saveAsImage);
    }

    // ---------- 初始化 ----------
    function init() {
        // 创建第一条示例曲线，带几个控制点并预设有趣的切线方向
        const demoCurve = createCurve("示例曲线");
        // 添加点并给每个点一个初始切线向量
        const pointsDemo = [
            { x: 150, y: 400, tx: 40, ty: -20 },
            { x: 320, y: 250, tx: 30, ty: 50 },
            { x: 500, y: 300, tx: -20, ty: -30 },
            { x: 680, y: 450, tx: -40, ty: 20 }
        ];
        for (let p of pointsDemo) {
            demoCurve.points.push({ ...p });
        }
        curves.push(demoCurve);
        currentCurveIndex = 0;
        updateCurveSelect();
        initEvents();
        redraw();
    }

    init();
})();