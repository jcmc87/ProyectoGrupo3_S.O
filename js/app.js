/* ============================================================
   app.js - EXT-SIM Sistema de Archivos Simulado
   Controlador de Apps y Lógica simple
   ============================================================ */

// Objeto controlador principal. Conecta la interfaz (UI) con el disco y el
// sistema de archivos simulados (disk y fsSim).
const app = {
    // ID del directorio que el administrador de archivos muestra actualmente.
    currentDirId: 0,

    /**
     * Inicializa el reloj y recupera del navegador una sesión guardada.
     * Se llama al final del archivo cuando termina de cargar el DOM.
     */
    init() {
        // Reloj
        setInterval(() => {
            // Hora actual formateada para mostrar solamente horas y minutos.
            const time = new Date().toLocaleTimeString('es-HN', {hour:'2-digit', minute:'2-digit'});
            document.getElementById('clock').textContent = time;
        }, 1000);
        
        // Cargar desde LocalStorage si existe
        if (localStorage.getItem('ext-disk') && localStorage.getItem('ext-fs')) {
            disk.deserialize(localStorage.getItem('ext-disk')); // Restaura el disco guardado.
            fsSim.deserialize(localStorage.getItem('ext-fs')); // Restaura directorios y archivos.
            this.currentDirId = fsSim.rootDirId;
            this.updateDesktop(); // Dibuja en el escritorio los elementos restaurados.
            document.getElementById('disk-status').textContent = `Disco: ${disk.superblock.totalMB}MB`;
        }
    },

    /**
     * Muestra u oculta el menú principal del sistema.
     * Este menú actúa como el 'Start Menu' en un SO clásico, dando acceso rápido
     * a las configuraciones principales y herramientas de archivos.
     */
    toggleMainMenu() {
        // Elemento HTML que contiene el menú principal.
        const menu = document.getElementById('main-menu');
        // Alternar la clase 'hidden' para mostrar/ocultar visualmente
        menu.classList.toggle('hidden');
    },

    /**
     * Función para 'Salir' del sistema.
     * Muestra una pantalla de apagado y oculta la interfaz gráfica.
     * En un entorno real, esto cerraría procesos y apagaría la máquina.
     * Aquí simulamos un apagado agregando un elemento que cubra toda la pantalla.
     */
    exitSystem() {
        // Ocultar el menú principal si está abierto
        this.toggleMainMenu(); // Llamada para cerrar el menú antes del apagado.
        
        // Crear un overlay negro en toda la pantalla para simular el apagado
        // Capa visual que cubrirá la interfaz durante el apagado simulado.
        const exitDiv = document.createElement('div');
        exitDiv.id = 'exit-screen';
        exitDiv.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 20px;">EXT-SIM OS</div>
            <div>Apagando el sistema...</div>
            <div style="margin-top: 10px; color: #888; font-size: 12px;">Los datos se han guardado en el almacenamiento local.</div>
        `;
        document.body.appendChild(exitDiv);
        
        // Guardamos todo el estado actual antes de "apagar"
        this.save(); // Llamada para persistir el estado antes de salir.
    },

    /**
     * Serializa el disco y el sistema de archivos en localStorage.
     * Se llama después de cualquier operación que modifica datos.
     */
    save() {
        localStorage.setItem('ext-disk', disk.serialize());
        localStorage.setItem('ext-fs', fsSim.serialize());
    },

    /**
     * Abre una de las ventanas disponibles en el escritorio.
     * @param {string} id - Aplicación a abrir: config, files, info o terminal.
     * Se llama desde los iconos/menú del HTML y desde updateDesktop().
     */
    openApp(id) {
        if (id === 'config') {
            UI.createWindow('config', '⚙️ Configuración del Sistema', `
                <div style="padding: 20px;">
                    <h3>Formatear Disco Simulado</h3>
                    <p style="color:#666; font-size:12px; margin-bottom:10px;">
                        Tamaño físico en MB (1 - 64)
                    </p>
                    <input type="number" id="cfg-mb" value="16">
                    
                    <p style="color:#666; font-size:12px; margin-top:10px; margin-bottom:5px;">
                        Tamaño de bloque
                    </p>
                    <select id="cfg-bs">
                        <option value="1">1 KB</option>
                        <option value="2">2 KB</option>
                        <option value="4" selected>4 KB (Estándar EXT4)</option>
                    </select>
                    
                    <br><br>
                    <button class="primary" style="width:100%" onclick="app.formatDisk()">Formatear Disco</button>
                </div>
            `, 320, 320);
        }
        else if (id === 'files') {
            if (!disk.initialized) return UI.showToast("Formatea el disco primero en 'Configuración'.");
            UI.createWindow('files', '📁 Administrador de Archivos', `
                <div class="fm-toolbar">
                    <button onclick="app.navigateUp()">⬆️ Subir</button>
                    <button onclick="app.showNewFolder()">+ Nueva Carpeta</button>
                    <button onclick="app.showNewFile()">+ Nuevo Archivo</button>
                    <span id="fm-path" style="margin-left:10px; font-family:monospace; color:#333;">/</span>
                </div>
                <div class="fm-content">
                    <div id="fm-list" class="fm-list"></div>
                    <div id="fm-details" class="fm-details">
                        <p style="color:#888; text-align:center; margin-top:20px;">
                            Selecciona un archivo para ver sus detalles.
                        </p>
                    </div>
                </div>
            `, 650, 450);
            this.refreshFM(); // Carga el contenido del directorio en la ventana recién abierta.
        }
        else if (id === 'info') {
            if (!disk.initialized) return UI.showToast("Formatea el disco primero en 'Configuración'.");
            UI.createWindow('info', '💽 Información del Disco', `
                <div style="padding: 15px;" id="info-content"></div>
            `, 600, 450);
            this.refreshInfo(); // Dibuja los datos actuales del disco.
        }
        else if (id === 'terminal') {
            if (!disk.initialized) return UI.showToast("Formatea el disco primero en 'Configuración'.");
            UI.createWindow('terminal', '🖥️ Terminal EXT', `
                <div style="background:#1e1e1e; color:#0f0; height:100%; padding:10px; display:flex; flex-direction:column;">
                    <div id="term-out" style="flex:1; overflow:auto; margin-bottom:10px;">
                        <div class="term-line" style="color:#aaa;">
                            Terminal EXT-SIM v1.0.<br>
                            Comandos: ls, mkdir, touch, rm, clear
                        </div>
                    </div>
                    <div style="display:flex;">
                        <span style="color:#0f0; margin-right:8px;">user@ext:~$</span>
                        <input type="text" id="term-in" class="term-input" autocomplete="off" onkeydown="if(event.key==='Enter') app.execCmd(this.value)">
                    </div>
                </div>
            `, 550, 350);
        }
    },

    /**
     * Formatea el disco con los valores elegidos en Configuración.
     * Se llama con el botón "Formatear Disco" creado en openApp().
     */
    formatDisk() {
        // Capacidad total del disco, leída del campo de configuración.
        const mb = parseInt(document.getElementById('cfg-mb').value);
        // Tamaño de cada bloque, leído del selector de configuración.
        const bs = parseInt(document.getElementById('cfg-bs').value);
        
        disk.init(mb, bs); // Crea bloques, bitmap, superbloque e inodos.
        fsSim.init(); // Crea el directorio raíz del nuevo sistema.
        
        this.currentDirId = fsSim.rootDirId;
        this.save(); // Guarda inmediatamente el disco recién formateado.
        this.updateDesktop(); // Actualiza los iconos del escritorio.
        
        document.getElementById('disk-status').textContent = `Disco: ${mb}MB`;
        UI.showToast(`Disco formateado (${mb}MB, Bloques de ${bs}KB)`);
        
        if (UI.windows['files']) this.refreshFM(); // Refresca el administrador si está abierto.
        if (UI.windows['info']) this.refreshInfo(); // Refresca la información si está abierta.
    },

    /**
     * Actualiza los iconos del escritorio leyendo el directorio raíz.
     * Se llama al iniciar, formatear y modificar el contenido de la raíz.
     */
    updateDesktop() {
        // Contenedor HTML donde se agregarán los iconos.
        const container = document.getElementById('desktop-icons');
        container.innerHTML = '';
        
        if (!disk.initialized || fsSim.rootDirId === null) return;
        
        // Objeto que representa el directorio raíz.
        const rootDir = fsSim.dirs[fsSim.rootDirId];
        if (!rootDir) return;

        // Iterar sobre los archivos/carpetas en la raíz
        for (const [name, ref] of Object.entries(rootDir.entries)) {
            // Indica si la entrada es una carpeta en vez de un archivo.
            const isDir = typeof ref === 'string' && ref.startsWith('dir:');
            // Emoji que se mostrará según el tipo de entrada.
            const icon = isDir ? '📁' : '📄';
            // Elemento visual que representa el archivo o carpeta.
            const div = document.createElement('div');
            div.className = 'desktop-icon';
            
            // Doble clic para abrir
            div.ondblclick = () => {
                this.openApp('files'); // Llama al administrador de archivos.
                if (isDir) {
                    this.currentDirId = parseInt(ref.split(':')[1]);
                    this.refreshFM(); // Muestra el contenido de la carpeta abierta.
                } else {
                    this.currentDirId = fsSim.rootDirId;
                    this.refreshFM(); // Muestra primero el directorio raíz.
                    this.selectFile(ref); // Muestra los detalles del archivo seleccionado.
                }
            };
            
            div.innerHTML = `
                <div class="icon">${icon}</div>
                <div class="name">${name}</div>
            `;
            container.appendChild(div);
        }
    },

    /**
     * Reconstruye la lista del administrador de archivos para currentDirId.
     * Se llama al navegar y después de crear, editar, mover o eliminar datos.
     */
    refreshFM() {
        if (!UI.windows['files']) return;
        
        // Contenedor de los archivos y carpetas visibles.
        const list = document.getElementById('fm-list');
        // Etiqueta que muestra la ruta del directorio actual.
        const pathLabel = document.getElementById('fm-path');
        list.innerHTML = '';
        
        pathLabel.textContent = fsSim.getDirPath(this.currentDirId);
        // Resultado con los datos del directorio y todas sus entradas.
        const result = fsSim.listDirectory(this.currentDirId);
        
        if (!result) return;
        
        result.items.forEach(item => {
            // Indica si el elemento actual es una carpeta.
            const isDir = item.type === 'dir';
            // Icono que diferencia carpetas de archivos.
            const icon = isDir ? '📁' : '📄';
            // Fila visual del elemento dentro del administrador.
            const div = document.createElement('div');
            div.className = 'fm-item';
            div.innerHTML = `<span class="icon">${icon}</span> <span style="flex:1;">${item.name}</span>`;
            
            // Un clic: seleccionar
            div.onclick = () => {
                document.querySelectorAll('.fm-item').forEach(e => e.classList.remove('selected'));
                div.classList.add('selected');
                
                if (!isDir) {
                    this.selectFile(item.inode.id); // Carga los detalles del archivo pulsado.
                } else {
                    document.getElementById('fm-details').innerHTML = `
                        <h3 style="margin-bottom:10px; word-break:break-all;">📁 ${item.name}</h3>
                        <p style="color:#666; margin-bottom:15px;">Carpeta</p>
                        <hr style="border:0; border-top:1px solid #ddd; margin:15px 0;">
                        <!-- Botón para Eliminar la carpeta -->
                        <button style="width:100%; background:#dc3545; color:white; border-color:#dc3545;" onclick="app.deleteDirectory(${item.dirId})">🗑️ Eliminar Carpeta</button>
                    `;
                }
            };
            
            // Doble clic: entrar a carpeta
            div.ondblclick = () => {
                if (isDir) {
                    this.currentDirId = item.id;
                    this.refreshFM(); // Redibuja la lista dentro de la carpeta.
                }
            };
            
            list.appendChild(div);
        });
        
        // Si estamos en la raíz, sincronizar el escritorio cada vez que la carpeta se actualice.
        if (this.currentDirId === fsSim.rootDirId) {
            this.updateDesktop(); // Sincroniza los iconos de la raíz.
        }
    },

    /**
     * Navega al directorio padre del directorio actual.
     * Se llama desde el botón "Subir" creado en openApp().
     */
    navigateUp() {
        // Directorio que se está mostrando actualmente.
        const dir = fsSim.dirs[this.currentDirId];
        if (dir && dir.parentId !== null) {
            this.currentDirId = dir.parentId;
            this.refreshFM(); // Muestra el contenido del nuevo directorio actual.
        }
    },

    /**
     * Presenta los metadatos y acciones disponibles para un archivo.
     * @param {number} inodeId - ID del inodo que identifica al archivo.
     * Se llama al seleccionar un archivo o después de guardarlo.
     */
    selectFile(inodeId) {
        // Obtenemos el inodo físico desde el disco simulado
        const inode = disk.getInode(inodeId); // Inodo con nombre, tamaño, bloques y contenido.
        if (!inode) return;
        
        // Generamos el HTML con los detalles del archivo
        // Agregamos un botón para 'Mover' el archivo, invocando showMoveFile
        document.getElementById('fm-details').innerHTML = `
            <h3 style="margin-bottom:5px; word-break:break-all;">📄 ${inode.name}</h3>
            <p style="color:#666; font-size:12px; margin-bottom:15px;">Inodo #${inode.id}</p>
            
            <p style="font-size:13px; margin-bottom:5px;"><strong>Tamaño:</strong> ${inode.size} bytes</p>
            <p style="font-size:13px; margin-bottom:5px;"><strong>Bloques Ocupados:</strong> ${inode.blocks.length}</p>
            <p style="font-size:13px; margin-bottom:15px; word-break:break-all;"><strong>Apuntadores:</strong><br>[${inode.blocks.join(', ')}]</p>
            
            <hr style="border:0; border-top:1px solid #ddd; margin:15px 0;">
            
            <!-- Botón para Editar Contenido -->
            <button style="width:100%; margin-bottom:8px;" onclick="app.showEditFile(${inodeId})">✏️ Editar Contenido</button>
            
            <!-- Botón para Mover el Archivo (Nueva Funcionalidad) -->
            <button style="width:100%; margin-bottom:8px; background:#17a2b8; color:white; border-color:#17a2b8;" onclick="app.showMoveFile(${inodeId})">📦 Mover</button>
            
            <!-- Botón para Eliminar -->
            <button style="width:100%; background:#dc3545; color:white; border-color:#dc3545;" onclick="app.deleteFile('${inode.name}')">🗑️ Eliminar</button>
        `;
    },

    /**
     * Abre el modal para capturar el nombre de una carpeta nueva.
     * Se llama desde el botón "Nueva Carpeta" del administrador.
     */
    showNewFolder() {
        UI.showModal("📁 Nueva Carpeta", `
            <label>Nombre de la carpeta:</label>
            <input type="text" id="new-name" placeholder="Ej: documentos">
        `, `<button class="primary" onclick="app.createFolder()">Crear</button>`);
    },

    /**
     * Crea la carpeta con el nombre escrito en el modal.
     * Se llama desde el botón "Crear" generado por showNewFolder().
     */
    createFolder() {
        // Nombre introducido por el usuario.
        const name = document.getElementById('new-name').value;
        // Resultado de intentar crear la carpeta en el directorio actual.
        const res = fsSim.createDirectory(name, this.currentDirId);
        if (res.success) {
            UI.hideModal();
            this.save(); // Persiste la carpeta nueva.
            this.refreshFM(); // Actualiza la lista y, si corresponde, el escritorio.
            UI.showToast(res.message);
        } else {
            UI.showToast(res.error);
        }
    },

    /**
     * Abre el modal para capturar el nombre y contenido de un archivo.
     * Se llama desde el botón "Nuevo Archivo" del administrador.
     */
    showNewFile() {
        UI.showModal("📄 Nuevo Archivo", `
            <label>Nombre del archivo:</label>
            <input type="text" id="new-name" placeholder="Ej: notas.txt">
            <label>Contenido texto:</label>
            <textarea id="new-content" rows="4" placeholder="Escribe algo aquí..."></textarea>
        `, `<button class="primary" onclick="app.createFile()">Crear</button>`);
    },

    /**
     * Crea un archivo con los datos escritos en el modal.
     * Se llama desde el botón "Crear" generado por showNewFile().
     */
    createFile() {
        // Nombre introducido para el archivo nuevo.
        const name = document.getElementById('new-name').value;
        // Texto que se almacenará como contenido del archivo.
        const content = document.getElementById('new-content').value;
        // Resultado de reservar el inodo, los bloques y la entrada de directorio.
        const res = fsSim.createFile(name, content, this.currentDirId);
        if (res.success) {
            UI.hideModal();
            this.save(); // Persiste el archivo nuevo.
            this.refreshFM(); // Actualiza el contenido del administrador.
            if (UI.windows['info']) this.refreshInfo(); // Actualiza el uso del disco.
            UI.showToast(res.message);
        } else {
            UI.showToast(res.error);
        }
    },

    /**
     * Abre un modal con el contenido actual de un archivo para editarlo.
     * @param {number} inodeId - Inodo del archivo que se editará.
     * Se llama desde el botón "Editar Contenido" de selectFile().
     */
    showEditFile(inodeId) {
        // Inodo que contiene el nombre y texto actual del archivo.
        const inode = disk.getInode(inodeId);
        UI.showModal(`✏️ Editar: ${inode.name}`, `
            <label>Contenido:</label>
            <textarea id="edit-content" rows="6">${inode.content || ''}</textarea>
        `, `<button class="primary" onclick="app.saveFile(${inodeId})">Guardar</button>`);
    },

    /**
     * Guarda el texto editado y reajusta los bloques del archivo si hace falta.
     * @param {number} inodeId - Inodo del archivo que se guardará.
     * Se llama desde el botón "Guardar" generado por showEditFile().
     */
    saveFile(inodeId) {
        // Nuevo contenido escrito en el editor.
        const content = document.getElementById('edit-content').value;
        // Resultado de actualizar el archivo en el sistema simulado.
        const res = fsSim.saveFile(inodeId, content);
        if (res.success) {
            UI.hideModal();
            this.save(); // Persiste el contenido actualizado.
            this.refreshFM(); // Refresca la lista de archivos.
            this.selectFile(inodeId); // Vuelve a mostrar sus metadatos actualizados.
            if (UI.windows['info']) this.refreshInfo(); // Actualiza el bitmap visible.
            UI.showToast(res.message);
        } else {
            UI.showToast(res.error);
        }
    },

    /**
     * Elimina un archivo de la carpeta actual y libera sus bloques.
     * @param {string} name - Nombre de la entrada que se eliminará.
     * Se llama desde el botón "Eliminar" de selectFile().
     */
    deleteFile(name) {
        // Directorio actual, necesario para convertir el nombre en un ID de inodo.
        const dir = fsSim.dirs[this.currentDirId];
        // Resultado de eliminar el inodo indicado por la entrada del directorio.
        const res = fsSim.deleteFile(dir.entries[name]);
        if (res.success) {
            this.save(); // Persiste la eliminación.
            this.refreshFM(); // Quita el archivo de la lista y del escritorio.
            document.getElementById('fm-details').innerHTML = `
                <p style="color:#888; text-align:center; margin-top:20px;">
                    Selecciona un archivo para ver sus detalles.
                </p>
            `;
            if (UI.windows['info']) this.refreshInfo(); // Refleja los bloques liberados.
            UI.showToast(res.message);
        } else {
            UI.showToast(res.error);
        }
    },

    /**
     * Elimina una carpeta invocando la función deleteDirectory del fs.js
     * @param {number} dirId - El ID del directorio a eliminar
     */
    deleteDirectory(dirId) {
        // Resultado de intentar eliminar la carpeta; fallará si no está vacía.
        const res = fsSim.deleteDirectory(dirId);
        if (res.success) {
            this.save(); // Persiste la eliminación de la carpeta.
            this.refreshFM(); // Actualiza el contenido visible.
            document.getElementById('fm-details').innerHTML = `
                <p style="color:#888; text-align:center; margin-top:20px;">
                    Selecciona un archivo para ver sus detalles.
                </p>
            `;
            // Sincronizar el escritorio si se modificó la raíz
            if (this.currentDirId === fsSim.rootDirId) {
                this.updateDesktop(); // Refleja el cambio en los iconos de la raíz.
            }
            UI.showToast(res.message);
        } else {
            // fsSim.deleteDirectory devolverá error si la carpeta no está vacía
            UI.showToast(res.error);
        }
    },

    /**
     * Prepara y muestra el modal para mover un archivo a otro directorio.
     * Solicita todos los directorios existentes en el FS para mostrarlos en un <select>.
     * 
     * @param {number} inodeId - El identificador del inodo del archivo a mover.
     */
    showMoveFile(inodeId) {
        // Inodo del archivo cuyo directorio padre se cambiará.
        const inode = disk.getInode(inodeId);
        
        // Obtenemos una lista plana de todos los directorios en el sistema de archivos
        // Esto permite construir un menú desplegable de destinos.
        const allDirs = fsSim.getAllDirs();
        
        // Construimos el HTML para los <option> del select
        let optionsHtml = '';
        allDirs.forEach(d => {
            // No permitimos mover al mismo directorio donde ya está el archivo
            if (d.id !== inode.parentDirId) {
                optionsHtml += `<option value="${d.id}">${d.path === '' ? '/' : d.path}</option>`;
            }
        });
        
        // Si no hay otros directorios a los cuales mover, mostramos una alerta en su lugar
        if (optionsHtml === '') {
            UI.showToast("No hay otros directorios a donde mover el archivo.");
            return;
        }

        // Mostramos el modal de UI.
        UI.showModal(`📦 Mover: ${inode.name}`, `
            <label>Selecciona la carpeta destino:</label>
            <select id="move-dest-dir">
                ${optionsHtml}
            </select>
            <p style="font-size:11px; color:#666; margin-top:10px;">
                Esta operación modifica la ubicación lógica (entradas de directorio),
                sin alterar los bloques físicos del disco.
            </p>
        `, `<button class="primary" onclick="app.moveFile(${inodeId})">Mover</button>`);
    },

    /**
     * Ejecuta la lógica para mover un archivo, interactuando con fs.js
     * 
     * @param {number} inodeId - El identificador del inodo del archivo a mover.
     */
    moveFile(inodeId) {
        // Obtenemos el ID del directorio destino desde el selector
        const targetDirId = parseInt(document.getElementById('move-dest-dir').value);
        
        // Llamamos a la API de bajo nivel fsSim.moveFile
        // Esto actualiza el parentDirId del inodo y las tablas de entradas de los directorios involucrados
        const res = fsSim.moveFile(inodeId, targetDirId);
        
        if (res.success) {
            UI.hideModal(); // Cerrar la ventana de diálogo
            this.save();    // Persistir el cambio en LocalStorage
            
            // Refrescar la vista actual (el archivo desaparecerá porque lo movimos)
            this.refreshFM();
            
            // Limpiar la vista de detalles porque el archivo ya no está en la carpeta actual
            document.getElementById('fm-details').innerHTML = `
                <p style="color:#888; text-align:center; margin-top:20px;">
                    Selecciona un archivo para ver sus detalles.
                </p>
            `;
            
            // Mostrar notificación de éxito al usuario
            UI.showToast(res.message);
        } else {
            // Mostrar error si por alguna razón falla (ej. mismo nombre en el destino)
            UI.showToast(res.error);
        }
    },

    /**
     * Actualiza la ventana de información y representa el bitmap de bloques.
     * Se llama al abrir la ventana y cuando cambia el uso del disco.
     */
    refreshInfo() {
        if (!UI.windows['info']) return;
        // Referencia corta al superbloque con las estadísticas globales.
        const sb = disk.superblock;
        
        // Cadena HTML donde se acumulan los cuadros del bitmap.
        let bmHtml = '';
        // Renderizar un máximo de 600 bloques para no colgar el navegador
        // Cantidad efectiva de bloques que se dibujarán.
        const total = Math.min(disk.blockBitmap.length, 600);
        
        for(let i = 0; i < total; i++) {
            // Color del bloque: verde libre, rojo ocupado o negro del sistema.
            let color = disk.blockBitmap[i] === 0 ? '#4caf50' : '#f44336';
            if (i < sb.systemBlocks) color = '#2b2b2b'; // bloques de sistema
            bmHtml += `<div style="width:10px; height:10px; background:${color}; display:inline-block; margin:1px; border-radius:1px;" title="Bloque ${i}"></div>`;
        }
        
        if (disk.blockBitmap.length > 600) {
            bmHtml += `<p style="font-size:11px; color:#888; margin-top:5px;">Mostrando primeros 600 bloques de ${disk.blockBitmap.length}</p>`;
        }

        document.getElementById('info-content').innerHTML = `
            <h3 style="margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">Superbloque</h3>
            <div style="display:flex; flex-wrap:wrap; gap:20px; font-size:13px; margin-bottom:20px;">
                <div><strong>Bloques Totales:</strong> <br>${sb.totalBlocks}</div>
                <div><strong>Bloques Libres:</strong> <br><span style="color:#4caf50">${sb.freeBlocks}</span></div>
                <div><strong>Bloques Usados:</strong> <br><span style="color:#f44336">${sb.usedBlocks}</span></div>
                <div><strong>Inodos:</strong> <br>${sb.usedInodes} de ${sb.totalInodes}</div>
            </div>
            
            <h3 style="margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">Bitmap de Bloques</h3>
            <p style="font-size:12px; margin-bottom:10px;">
                <span style="color:#2b2b2b">■</span> Sistema (SB, Bitmap, Tabla Inodos) &nbsp;
                <span style="color:#4caf50">■</span> Libre &nbsp;
                <span style="color:#f44336">■</span> Ocupado por Datos
            </p>
            <div style="background:#f5f5f5; padding:10px; border:1px solid #ddd; border-radius:4px;">
                ${bmHtml}
            </div>
        `;
    },

    /**
     * Interpreta y ejecuta un comando escrito en la terminal simulada.
     * @param {string} cmd - Línea escrita por el usuario.
     * Se llama al presionar Enter en el campo creado por openApp('terminal').
     */
    execCmd(cmd) {
        document.getElementById('term-in').value = '';
        // Contenedor donde se imprime el historial de la terminal.
        const out = document.getElementById('term-out');
        
        // Print command
        out.innerHTML += `<div class="term-line" style="color:#fff;">$ ${cmd}</div>`;
        
        // Partes del comando: posición 0 es la orden y las demás son argumentos.
        const args = cmd.trim().split(/\s+/);
        // Nombre de la orden que se va a ejecutar.
        const c = args[0];
        // Respuesta que se imprimirá al terminar la operación.
        let res = '';
        
        if (c === '') return;
        
        if (c === 'ls') {
            // Contenido del directorio actual solicitado por el comando ls.
            const list = fsSim.listDirectory(this.currentDirId);
            if (list) {
                res = list.items.map(i => {
                    // Azul para directorios y blanco para archivos.
                    const color = i.type === 'dir' ? '#3b82f6' : '#fff';
                    return `<span style="color:${color}; margin-right:10px;">${i.name}</span>`;
                }).join('');
            }
        } else if (c === 'mkdir' && args[1]) {
            // Resultado de crear la carpeta indicada en el segundo argumento.
            const r = fsSim.createDirectory(args[1], this.currentDirId);
            res = r.success ? 'Directorio creado' : `<span style="color:red">${r.error}</span>`;
            // Si hubo cambios, llama a save() y refreshFM() para persistir y redibujar.
            if (r.success) { this.save(); this.refreshFM(); }
        } else if (c === 'touch' && args[1]) {
            // Resultado de crear un archivo casi vacío con touch.
            const r = fsSim.createFile(args[1], ' ', this.currentDirId);
            res = r.success ? 'Archivo creado' : `<span style="color:red">${r.error}</span>`;
            // Las llamadas actualizan almacenamiento, archivos visibles e información del disco.
            if (r.success) { this.save(); this.refreshFM(); if (UI.windows['info']) this.refreshInfo(); }
        } else if (c === 'rm' && args[1]) {
            // Directorio donde rm buscará la entrada solicitada.
            const dir = fsSim.dirs[this.currentDirId];
            if (dir && dir.entries[args[1]]) {
                // Referencia de la entrada: ID de inodo o texto "dir:ID".
                const ref = dir.entries[args[1]];
                if (typeof ref === 'string' && ref.startsWith('dir:')) {
                    res = '<span style="color:red">Es un directorio. Usa rmdir.</span>';
                } else {
                    // Resultado de borrar el archivo identificado por ref.
                    const r = fsSim.deleteFile(ref);
                    res = r.success ? 'Archivo eliminado' : `<span style="color:red">${r.error}</span>`;
                    if (r.success) { this.save(); this.refreshFM(); if (UI.windows['info']) this.refreshInfo(); }
                }
            } else res = '<span style="color:red">No existe el archivo</span>';
        } else if (c === 'rmdir' && args[1]) {
            // Directorio donde rmdir buscará la carpeta solicitada.
            const dir = fsSim.dirs[this.currentDirId];
            if (dir && dir.entries[args[1]]) {
                // Referencia que debe tener el formato "dir:ID".
                const ref = dir.entries[args[1]];
                if (typeof ref === 'string' && ref.startsWith('dir:')) {
                    // Resultado de eliminar la carpeta, solamente si está vacía.
                    const r = fsSim.deleteDirectory(parseInt(ref.split(':')[1]));
                    res = r.success ? 'Directorio eliminado' : `<span style="color:red">${r.error}</span>`;
                    if (r.success) { this.save(); this.refreshFM(); }
                } else {
                    res = '<span style="color:red">Es un archivo. Usa rm.</span>';
                }
            } else res = '<span style="color:red">No existe el directorio</span>';
        } else if (c === 'clear') {
            out.innerHTML = '';
            return;
        } else {
            res = '<span style="color:red">Comando no reconocido. Uso: ls, mkdir &lt;nom&gt;, touch &lt;nom&gt;, rm &lt;nom&gt;, rmdir &lt;nom&gt;</span>';
        }
        
        if (res) out.innerHTML += `<div class="term-line">${res}</div>`;
        out.scrollTop = out.scrollHeight; // Scroll to bottom
    }
};

// Punto de entrada: cuando el HTML está listo, llama a app.init() para arrancar.
document.addEventListener('DOMContentLoaded', () => app.init());
