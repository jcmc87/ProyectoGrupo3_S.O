/**
 * ============================================================
 * disk.js — Motor del Disco Simulado tipo EXT
 * ============================================================
 * Universidad Tecnológica Centroamericana (UNITEC-CEUTEC)
 * Sistemas Operativos I | Sección 74 | Proyecto Grupal
 *
 * Este módulo simula el hardware de almacenamiento:
 *  - Disco: array de N bloques físicos de tamaño fijo
 *  - Superbloque: metadatos globales del sistema de archivos
 *  - Bitmap: registro de bloques libres (0) y ocupados (1)
 *  - Tabla de inodos: índices con apuntadores a bloques físicos
 * ============================================================
 */

'use strict';

// ============================================================
// CLASE PRINCIPAL: Disco Simulado
// ============================================================
class SimulatedDisk {
    constructor() {
        this.initialized = false;
        this.superblock   = null;  // Metadatos del FS
        this.blockBitmap  = [];    // 0=libre, 1=ocupado
        this.blocks       = [];    // Array de bloques físicos
        this.inodeTable   = [];    // Tabla de inodos
        this.nextInodeId  = 0;     // Contador monotónico de inodos
    }

    // ----------------------------------------------------------
    // init(totalMB, blockSizeKB)
    // Inicializa el disco con los parámetros dados por el usuario.
    // Calcula la cantidad de bloques, reserva espacio del sistema
    // y crea el superbloque con todos los contadores.
    // ----------------------------------------------------------
    init(totalMB, blockSizeKB) {
        const totalBytes     = totalMB * 1024 * 1024;
        const blockSizeBytes = blockSizeKB * 1024;

        // Número total de bloques que caben en el disco
        const totalBlocks = Math.floor(totalBytes / blockSizeBytes);

        // Bloques reservados para estructuras del sistema (~5%, mínimo 3)
        // Bloque 0: Superbloque | Bloque 1: Bitmap | Bloque 2+: Inodos
        const systemBlocks = Math.max(3, Math.floor(totalBlocks * 0.05));
        const dataBlocks   = totalBlocks - systemBlocks;

        // Máximo de inodos: 1 inodo por cada 4 bloques de datos (heurística EXT2)
        const maxInodes = Math.max(16, Math.floor(dataBlocks / 4));

        // ── SUPERBLOQUE ──────────────────────────────────────
        // Estructura que describe globalmente el sistema de archivos.
        // EXT2 real usa este bloque siempre en el offset 1024 del disco.
        this.superblock = {
            magic         : 'EXT-SIM-74',       // Número mágico de identificación
            totalBlocks   : totalBlocks,          // Total de bloques en disco
            blockSize     : blockSizeBytes,       // Bytes por bloque
            blockSizeKB   : blockSizeKB,          // KB por bloque (para display)
            systemBlocks  : systemBlocks,         // Bloques reservados al sistema
            dataBlocks    : dataBlocks,           // Bloques disponibles para datos
            freeBlocks    : dataBlocks,           // Bloques libres actualmente
            usedBlocks    : 0,                    // Bloques en uso
            totalInodes   : maxInodes,            // Capacidad máxima de inodos
            freeInodes    : maxInodes,            // Inodos libres actualmente
            usedInodes    : 0,                    // Inodos en uso
            totalMB       : totalMB,              // Tamaño total configurado
            createdAt     : new Date().toISOString(),
            lastModified  : new Date().toISOString(),
        };

        // ── BITMAP DE BLOQUES ─────────────────────────────────
        // Array donde cada posición i corresponde al bloque i.
        // 0 = bloque libre | 1 = bloque ocupado
        // Los bloques del sistema (0..systemBlocks-1) siempre están marcados.
        this.blockBitmap = new Array(totalBlocks).fill(0);
        for (let i = 0; i < systemBlocks; i++) {
            this.blockBitmap[i] = 1; // Bloque del sistema → siempre ocupado
        }

        // ── BLOQUES FÍSICOS ───────────────────────────────────
        // Cada elemento representa un bloque de almacenamiento.
        // En EXT real sería un sector del disco; aquí es un objeto JS.
        this.blocks = Array.from({ length: totalBlocks }, (_, i) => ({
            id      : i,
            data    : i < systemBlocks ? '[SISTEMA]' : null,
            inodeId : null,   // null = bloque libre
        }));

        // ── TABLA DE INODOS ───────────────────────────────────
        this.inodeTable  = [];
        this.nextInodeId = 0;
        this.initialized = true;

        return this.superblock;
    }

    // ----------------------------------------------------------
    // allocateBlocks(count)
    // Busca `count` bloques libres en el bitmap y los reserva.
    // Algoritmo: First-Fit — toma los primeros bloques libres.
    // Retorna array de índices, o [] si no hay espacio suficiente.
    // ----------------------------------------------------------
    allocateBlocks(count) {
        if (count <= 0) return [];
        if (this.superblock.freeBlocks < count) return [];

        const allocated = [];

        // Recorrer el bitmap a partir del primer bloque de datos
        for (let i = this.superblock.systemBlocks; i < this.superblock.totalBlocks; i++) {
            if (this.blockBitmap[i] === 0) {
                // Marcar como ocupado en el bitmap
                this.blockBitmap[i] = 1;
                allocated.push(i);
                if (allocated.length === count) break;
            }
        }

        // Actualizar contadores en el superbloque
        this.superblock.freeBlocks  -= allocated.length;
        this.superblock.usedBlocks  += allocated.length;
        this.superblock.lastModified = new Date().toISOString();

        return allocated;
    }

    //Comprobando la rama que acabo de crear y validnado que si funcione 

    // ----------------------------------------------------------
    // freeBlocks(blockList)
    // Libera los bloques indicados: los marca como 0 en el bitmap
    // y limpia el contenido del bloque físico.
    // ----------------------------------------------------------
    freeBlocks(blockList) {
        let freed = 0;
        for (const id of blockList) {
            if (id >= this.superblock.systemBlocks && id < this.superblock.totalBlocks) {
                // Liberar en el bitmap
                this.blockBitmap[id] = 0;
                // Limpiar el bloque físico
                this.blocks[id].data    = null;
                this.blocks[id].inodeId = null;
                freed++;
            }
        }

        // Actualizar contadores en el superbloque
        this.superblock.freeBlocks  += freed;
        this.superblock.usedBlocks  -= freed;
        this.superblock.lastModified = new Date().toISOString();
    }

    // ----------------------------------------------------------
    // createInode({ name, type, size, blockList, parentDirId, content })
    // Crea un nuevo inodo en la tabla y apunta los bloques físicos.
    // En EXT2 real, el inodo almacena apuntadores directos (12),
    // indirectos simples, dobles y triples. Aquí sólo usamos directos.
    // ----------------------------------------------------------
    createInode({ name, type, size, blockList, parentDirId, content = '' }) {
        if (this.superblock.freeInodes === 0) {
            throw new Error('Tabla de inodos llena: no hay inodos disponibles');
        }

        const inode = {
            id          : this.nextInodeId++,       // Número de inodo (único)
            name        : name,                      // Nombre del archivo/carpeta
            type        : type,                      // 'file' | 'dir'
            size        : size,                      // Tamaño en bytes
            blocks      : [...blockList],            // Apuntadores directos a bloques
            content     : content,                   // Contenido (simulado en memoria)
            parentDirId : parentDirId,               // Referencia al directorio padre
            permissions : type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--',
            links       : type === 'dir' ? 2 : 1,   // Contador de hard links
            uid         : 1000,                      // Usuario propietario (simulado)
            gid         : 1000,                      // Grupo propietario (simulado)
            createdAt   : new Date().toISOString(),
            modifiedAt  : new Date().toISOString(),
            accessedAt  : new Date().toISOString(),
        };

        // Registrar en cada bloque físico a qué inodo pertenece
        for (const blockId of blockList) {
            this.blocks[blockId].inodeId = inode.id;
            this.blocks[blockId].data    = `[Inodo #${inode.id}: ${name}]`;
        }

        this.inodeTable.push(inode);
        this.superblock.freeInodes--;
        this.superblock.usedInodes++;

        return inode;
    }

    // ----------------------------------------------------------
    // deleteInode(inodeId)
    // Elimina el inodo de la tabla y libera sus bloques físicos.
    // ----------------------------------------------------------
    deleteInode(inodeId) {
        const idx = this.inodeTable.findIndex(n => n.id === inodeId);
        if (idx === -1) return false;

        const inode = this.inodeTable[idx];

        // Liberar bloques físicos apuntados por este inodo
        this.freeBlocks(inode.blocks);

        // Remover el inodo de la tabla
        this.inodeTable.splice(idx, 1);
        this.superblock.freeInodes++;
        this.superblock.usedInodes--;

        return true;
    }

    // ----------------------------------------------------------
    // getInode(inodeId)  →  objeto inodo | null
    // ----------------------------------------------------------
    getInode(inodeId) {
        return this.inodeTable.find(n => n.id === inodeId) ?? null;
    }

    // ----------------------------------------------------------
    // calcBlocksNeeded(sizeBytes)
    // Calcula cuántos bloques se necesitan para almacenar N bytes.
    // Siempre se usa al menos 1 bloque (incluso para archivos vacíos).
    // ----------------------------------------------------------
    calcBlocksNeeded(sizeBytes) {
        if (sizeBytes <= 0) return 1;
        return Math.ceil(sizeBytes / this.superblock.blockSize);
    }

    // ----------------------------------------------------------
    // Persistencia: serialize / deserialize
    // Convierte el estado completo del disco a JSON y viceversa,
    // para poder guardarlo en localStorage del navegador.
    // ----------------------------------------------------------
    serialize() {
        return JSON.stringify({
            initialized  : this.initialized,
            superblock   : this.superblock,
            blockBitmap  : this.blockBitmap,
            blocks       : this.blocks,
            inodeTable   : this.inodeTable,
            nextInodeId  : this.nextInodeId,
        });
    }

    deserialize(json) {
        const d = JSON.parse(json);
        this.initialized = d.initialized;
        this.superblock  = d.superblock;
        this.blockBitmap = d.blockBitmap;
        this.blocks      = d.blocks;
        this.inodeTable  = d.inodeTable;
        this.nextInodeId = d.nextInodeId;
    }

    // ----------------------------------------------------------
    // reset() — Borra todo el estado del disco
    // ----------------------------------------------------------
    reset() {
        this.initialized = false;
        this.superblock  = null;
        this.blockBitmap = [];
        this.blocks      = [];
        this.inodeTable  = [];
        this.nextInodeId = 0;
    }
}

// ── Instancia global del disco (singleton) ───────────────────
const disk = new SimulatedDisk();
