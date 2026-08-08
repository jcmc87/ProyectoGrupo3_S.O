/* ============================================================
   ui.js - EXT-SIM Sistema de Archivos Simulado
   Window Manager y controles UI simples.
   ============================================================ */

const UI = {
    windows: {},
    zIndex: 100,

    // Crear o enfocar una ventana
    createWindow(id, title, html, width = 600, height = 400) {
        if (this.windows[id]) {
            this.focusWindow(id);
            // Refrescar vistas si ya está abierta
            if (id === 'files') app.refreshFM();
            if (id === 'info') app.refreshInfo();
            return;
        }

        const win = document.createElement('div');
        win.className = 'window';
        win.id = 'win-' + id;
        win.style.width = width + 'px';
        win.style.height = height + 'px';
        
        // Posicionar en cascada simple
        const offset = Object.keys(this.windows).length * 40;
        win.style.left = (150 + offset) + 'px';
        win.style.top = (80 + offset) + 'px';
        
        win.innerHTML = `
            <div class="window-header" onmousedown="UI.startDrag(event, '${id}')">
                <div class="window-title">${title}</div>
                <div class="window-controls">
                    <span onclick="UI.closeWindow('${id}')">✕</span>
                </div>
            </div>
            <div class="window-body" id="body-${id}">
                ${html}
            </div>
        `;
        
        // Enfocar al dar clic en la ventana
        win.onmousedown = () => this.focusWindow(id);
        
        document.getElementById('windows-container').appendChild(win);
        this.windows[id] = win;
        this.focusWindow(id);
    },

    closeWindow(id) {
        if (this.windows[id]) {
            this.windows[id].remove();
            delete this.windows[id];
        }
    },

    focusWindow(id) {
        if (this.windows[id]) {
            this.zIndex++;
            this.windows[id].style.zIndex = this.zIndex;
        }
    },

    // Lógica para arrastrar ventanas (Drag)
    dragState: null,
    startDrag(e, id) {
        if (e.target.tagName === 'SPAN') return; // Ignorar botón cerrar
        const win = this.windows[id];
        this.dragState = {
            win: win,
            offsetX: e.clientX - win.offsetLeft,
            offsetY: e.clientY - win.offsetTop
        };
        document.onmousemove = UI.doDrag;
        document.onmouseup = UI.stopDrag;
    },
    doDrag(e) {
        if (UI.dragState) {
            UI.dragState.win.style.left = (e.clientX - UI.dragState.offsetX) + 'px';
            UI.dragState.win.style.top = (e.clientY - UI.dragState.offsetY) + 'px';
        }
    },
    stopDrag() {
        UI.dragState = null;
        document.onmousemove = null;
        document.onmouseup = null;
    },

    // Manejo de Modales
    showModal(title, html, btnsHtml) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = html;
        document.getElementById('modal-foot').innerHTML = btnsHtml + ' <button onclick="UI.hideModal()">Cancelar</button>';
        document.getElementById('modal-bg').classList.remove('hidden');
    },
    hideModal() {
        document.getElementById('modal-bg').classList.add('hidden');
    },

    // Notificaciones Toasts
    showToast(msg) {
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        document.getElementById('toasts').appendChild(t);
        setTimeout(() => t.remove(), 3500);
    }
};
