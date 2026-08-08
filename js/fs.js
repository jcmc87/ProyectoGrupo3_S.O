/**
 * ============================================================
 * fs.js — Operaciones del Sistema de Archivos tipo EXT
 * ============================================================
 * Universidad Tecnológica Centroamericana (UNITEC-CEUTEC)
 * Sistemas Operativos I | Sección 74 | Proyecto Grupal
 *
 * Este módulo implementa las operaciones de alto nivel del FS:
 *  - createFile  → Reserva bloques, crea inodo, registra en dir
 *  - saveFile    → Libera bloques viejos, asigna nuevos, actualiza inodo
 *  - deleteFile  → Libera bloques, borra inodo, limpia directorio
 *  - moveFile    → Reubica entrada sin tocar bloques físicos
 *  - createDirectory / deleteDirectory
 *
 * Depende de: disk.js (debe cargarse antes)
 * ============================================================
 */

'use strict';

// ============================================================
// CLASE: Sistema de Archivos
// ============================================================
class FileSystem {
    constructor(diskInstance) {
        this.disk       = diskInstance; // Referencia al disco simulado
        this.dirs       = {};           // { id: { id, name, parentId, entries: {nombre→ref} } }
        this.rootDirId  = null;         // ID del directorio raíz
        this.nextDirId  = 0;            // Contador de IDs de directorio
    }

    // ----------------------------------------------------------
    // init()
    // Crea el directorio raíz "/" y reinicia la estructura de dirs.
    // Se llama una sola vez después de formatear el disco.
    // ----------------------------------------------------------
    init() {
        this.dirs      = {};
        this.nextDirId = 0;

        // Directorio raíz: no tiene padre (parentId = null)
        const root = {
            id       : this.nextDirId++,
            name     : '/',
            parentId : null,
            entries  : {},  // { 'nombre.txt': inodeId } o { 'carpeta': 'dir:N' }
        };
        this.dirs[root.id] = root;
        this.rootDirId     = root.id;

        return root;
    }

    // ----------------------------------------------------------
    // createFile(name, content, dirId)
    // Crea un archivo nuevo en el directorio especificado.
    //
    // Algoritmo:
    //   1. Validar nombre y que no exista en el directorio
    //   2. Calcular tamaño del contenido en bytes
    //   3. Reservar bloques libres con disk.allocateBlocks()
    //   4. Crear inodo con apuntadores a esos bloques
    //   5. Registrar la entrada en el directorio padre
    // ----------------------------------------------------------
    createFile(name, content, dirId) {
        const dir = this.dirs[dirId];
        if (!dir) return { success: false, error: 'Directorio no encontrado' };

        // Validaciones básicas
        if (!this._validName(name)) {
            return { success: false, error: 'Nombre inválido (evitar: / \\ ? * : | " < >)' };
        }
        if (dir.entries[name] !== undefined) {
            return { success: false, error: `Ya existe "${name}" en este directorio` };
        }
        if (!this.disk.initialized) {
            return { success: false, error: 'El disco no está inicializado' };
        }

        // Calcular cuántos bytes ocupa el contenido
        const sizeBytes    = content ? new TextEncoder().encode(content).length : 1;
        // Número de bloques necesarios (cada bloque = blockSize bytes)
        const blocksNeeded = this.disk.calcBlocksNeeded(sizeBytes);

        // Reservar bloques libres en el bitmap (First-Fit)
        const allocated = this.disk.allocateBlocks(blocksNeeded);
        if (allocated.length === 0) {
            return { success: false, error: `Sin espacio: se necesitan ${blocksNeeded} bloque(s) pero no hay suficientes libres` };
        }

        // Crear el inodo con los apuntadores directos a los bloques asignados
        let inode;
        try {
            inode = this.disk.createInode({
                name       : name,
                type       : 'file',
                size       : sizeBytes,
                blockList  : allocated,
                parentDirId: dirId,
                content    : content || '',
            });
        } catch (err) {
            // Revertir: liberar los bloques ya reservados
            this.disk.freeBlocks(allocated);
            return { success: false, error: err.message };
        }

        // Registrar en el directorio: nombre → ID de inodo
        dir.entries[name] = inode.id;

        return {
            success        : true,
            inode          : inode,
            blocksAllocated: allocated,
            message        : `✓ "${name}" creado — ${blocksNeeded} bloque(s) asignado(s) [Inodo #${inode.id}]`,
        };
    }

    // ----------------------------------------------------------
    // saveFile(inodeId, newContent)
    // Reemplaza el contenido de un archivo existente.
    //
    // Algoritmo (importante: orden correcto para evitar pérdida):
    //   1. Reservar los NUEVOS bloques primero
    //   2. Si la reserva fue exitosa, liberar los bloques VIEJOS
    //   3. Actualizar el inodo con los nuevos apuntadores
    //
    // (Si se liberaran primero y luego fallara la reserva, habría
    //  corrupción. Este orden garantiza atomicidad parcial.)
    // ----------------------------------------------------------
    saveFile(inodeId, newContent) {
        const inode = this.disk.getInode(inodeId);
        if (!inode)               return { success: false, error: 'Inodo no encontrado' };
        if (inode.type !== 'file') return { success: false, error: 'No es un archivo' };

        const sizeBytes    = newContent ? new TextEncoder().encode(newContent).length : 1;
        const blocksNeeded = this.disk.calcBlocksNeeded(sizeBytes);
        const oldBlocks    = [...inode.blocks];

        // PASO 1: Reservar nuevos bloques
        const newBlocks = this.disk.allocateBlocks(blocksNeeded);
        if (newBlocks.length === 0) {
            return { success: false, error: 'Sin espacio en disco para guardar el archivo' };
        }

        // PASO 2: Liberar bloques anteriores (ahora que tenemos los nuevos)
        this.disk.freeBlocks(oldBlocks);

        // PASO 3: Actualizar inodo
        inode.blocks     = newBlocks;
        inode.size       = sizeBytes;
        inode.content    = newContent || '';
        inode.modifiedAt = new Date().toISOString();

        // Apuntar los nuevos bloques físicos al inodo
        for (const bid of newBlocks) {
            this.disk.blocks[bid].inodeId = inode.id;
            this.disk.blocks[bid].data    = `[Inodo #${inode.id}: ${inode.name}]`;
        }

        return {
            success  : true,
            inode    : inode,
            oldBlocks: oldBlocks,
            newBlocks: newBlocks,
            message  : `✓ "${inode.name}" guardado — ${oldBlocks.length}→${newBlocks.length} bloque(s)`,
        };
    }

    // ----------------------------------------------------------
    // deleteFile(inodeId)
    // Elimina un archivo del sistema de archivos.
    //
    // Algoritmo:
    //   1. Marcar bloques como libres en el bitmap
    //   2. Borrar el inodo de la tabla
    //   3. Eliminar la entrada en el directorio padre
    // ----------------------------------------------------------
    deleteFile(inodeId) {
        const inode = this.disk.getInode(inodeId);
        if (!inode) return { success: false, error: 'Inodo no encontrado' };

        const name         = inode.name;
        const freedBlocks  = [...inode.blocks];
        const parentDirId  = inode.parentDirId;

        // Eliminar entrada del directorio padre
        const parentDir = this.dirs[parentDirId];
        if (parentDir && parentDir.entries[name] === inodeId) {
            delete parentDir.entries[name];
        }

        // Eliminar inodo (también libera bloques internamente)
        this.disk.deleteInode(inodeId);

        return {
            success     : true,
            freedBlocks : freedBlocks,
            message     : `✓ "${name}" eliminado — ${freedBlocks.length} bloque(s) liberado(s)`,
        };
    }

    // ----------------------------------------------------------
    // moveFile(inodeId, targetDirId)
    // Mueve un archivo a otro directorio.
    //
    // Clave: NO se tocan los bloques físicos del disco.
    // Solo se actualiza la entrada en los directorios afectados
    // y el campo parentDirId del inodo.
    // ----------------------------------------------------------
    moveFile(inodeId, targetDirId) {
        const inode     = this.disk.getInode(inodeId);
        const targetDir = this.dirs[targetDirId];

        if (!inode)     return { success: false, error: 'Inodo no encontrado' };
        if (!targetDir) return { success: false, error: 'Directorio destino no encontrado' };
        if (inode.parentDirId === targetDirId) {
            return { success: false, error: 'El archivo ya está en ese directorio' };
        }
        if (targetDir.entries[inode.name] !== undefined) {
            return { success: false, error: `Ya existe "${inode.name}" en el directorio destino` };
        }

        // Eliminar del directorio origen
        const srcDir = this.dirs[inode.parentDirId];
        if (srcDir) delete srcDir.entries[inode.name];

        // Agregar al directorio destino
        targetDir.entries[inode.name] = inode.id;

        // Actualizar referencia del padre en el inodo
        inode.parentDirId = targetDirId;
        inode.modifiedAt  = new Date().toISOString();

        return {
            success : true,
            message : `✓ "${inode.name}" movido a "${targetDir.name}" (bloques físicos sin cambio)`,
        };
    }

    // ----------------------------------------------------------
    // createDirectory(name, parentDirId)
    // Crea un subdirectorio nuevo (no necesita bloques de datos).
    // ----------------------------------------------------------
    createDirectory(name, parentDirId) {
        const parentDir = this.dirs[parentDirId];
        if (!parentDir) return { success: false, error: 'Directorio padre no encontrado' };

        if (!this._validName(name)) {
            return { success: false, error: 'Nombre de carpeta inválido' };
        }
        if (parentDir.entries[name] !== undefined) {
            return { success: false, error: `Ya existe "${name}" en este directorio` };
        }

        const dir = {
            id       : this.nextDirId++,
            name     : name,
            parentId : parentDirId,
            entries  : {},
        };
        this.dirs[dir.id] = dir;

        // Registrar en el padre con el prefijo 'dir:' para distinguirlo de inodos
        parentDir.entries[name] = `dir:${dir.id}`;

        return { success: true, dir, message: `✓ Carpeta "${name}" creada` };
    }

    // ----------------------------------------------------------
    // deleteDirectory(dirId)
    // Elimina un directorio sólo si está vacío.
    // ----------------------------------------------------------
    deleteDirectory(dirId) {
        if (dirId === this.rootDirId) {
            return { success: false, error: 'No se puede eliminar el directorio raíz' };
        }
        const dir = this.dirs[dirId];
        if (!dir) return { success: false, error: 'Directorio no encontrado' };

        if (Object.keys(dir.entries).length > 0) {
            return { success: false, error: 'No se puede eliminar: el directorio no está vacío' };
        }

        const parentDir = this.dirs[dir.parentId];
        if (parentDir) delete parentDir.entries[dir.name];

        delete this.dirs[dirId];

        return { success: true, message: `✓ Carpeta "${dir.name}" eliminada` };
    }

    // ----------------------------------------------------------
    // listDirectory(dirId)
    // Retorna el contenido de un directorio con metadatos.
    // ----------------------------------------------------------
    listDirectory(dirId) {
        const dir = this.dirs[dirId];
        if (!dir) return null;

        const items = [];
        for (const [name, ref] of Object.entries(dir.entries)) {
            if (typeof ref === 'string' && ref.startsWith('dir:')) {
                const subId  = parseInt(ref.split(':')[1]);
                const subDir = this.dirs[subId];
                items.push({
                    name    : name,
                    type    : 'dir',
                    dirId   : subId,
                    dirObj  : subDir,
                    childCount: subDir ? Object.keys(subDir.entries).length : 0,
                });
            } else {
                const inode = this.disk.getInode(ref);
                items.push({
                    name   : name,
                    type   : 'file',
                    inodeId: ref,
                    inode  : inode,
                });
            }
        }

        // Ordenar: primero carpetas, luego archivos, ambos alfabéticos
        items.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        return { dir, items };
    }

    // ----------------------------------------------------------
    // getDirPath(dirId)  →  string "/ruta/completa"
    // Construye la ruta absoluta del directorio recorriendo el árbol.
    // ----------------------------------------------------------
    getDirPath(dirId) {
        const parts = [];
        let curr    = this.dirs[dirId];
        while (curr) {
            if (curr.name !== '/') parts.unshift(curr.name);
            if (curr.parentId === null) break;
            curr = this.dirs[curr.parentId];
        }
        return '/' + parts.join('/');
    }

    // ----------------------------------------------------------
    // getAllDirs()
    // Retorna lista plana de todos los directorios para el selector
    // de destino al mover archivos.
    // ----------------------------------------------------------
    getAllDirs() {
        return Object.values(this.dirs).map(d => ({
            id  : d.id,
            path: this.getDirPath(d.id),
        }));
    }

    // ----------------------------------------------------------
    // _validName(name)  →  boolean
    // Verifica que el nombre no tenga caracteres reservados.
    // ----------------------------------------------------------
    _validName(name) {
        if (!name || name.trim() === '') return false;
        return !/[\/\\?*:|"<>]/.test(name) && name.length <= 255;
    }

    // ----------------------------------------------------------
    // Persistencia
    // ----------------------------------------------------------
    serialize() {
        return JSON.stringify({
            dirs      : this.dirs,
            rootDirId : this.rootDirId,
            nextDirId : this.nextDirId,
        });
    }

    deserialize(json) {
        const d       = JSON.parse(json);
        this.dirs      = d.dirs;
        this.rootDirId = d.rootDirId;
        this.nextDirId = d.nextDirId;
    }

    reset() {
        this.dirs      = {};
        this.rootDirId = null;
        this.nextDirId = 0;
    }
}

// ── Instancia global del sistema de archivos ─────────────────
const fsSim = new FileSystem(disk);
