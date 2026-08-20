'use strict';


/*  ------------------ Disco Simulado -----------------------------------  */
//Creando la estructura principal del disco
class SimulatedDisk {
    constructor() {
        this.initialized = false;  //Verificamos si el disco ya fue incializado
        this.superblock   = null;  // Guarda la metadata del file system
        this.blockBitmap  = [];    // Que bloques estan libres y ocupados: 0=libre, 1=ocupado
        this.blocks       = [];    // Array de bloques físicos
        this.inodeTable   = [];    // Tabla para guardar los inodos
        this.nextInodeId  = 0;     // Genera ID para nuevos inodos
    }

/* ----------------------------- Inicializacion del Disco -----------------------
Inicializamos nuestro disco simulado con la informacion que nos dio el usuariario
calculando el numero de bloques y espacio de sistema. A su vez, crea el superbloque con los contadores */

    init(totalMB, blockSizeKB) {  //recibe el tamanio del disco, tamano del bloque
        const totalBytes     = totalMB * 1024 * 1024; //convirtiendo a bytes
        const blockSizeBytes = blockSizeKB * 1024; // convirtiendo a bytes

      
        const totalBlocks = Math.floor(totalBytes / blockSizeBytes); // calculando cuantos bloques caben en el disco
 
        //Cantidad de bloques = tamanio total / tamanio de cada bloque

 //---------------------------- Bloques de Sistema y Bloques de Datos -----------------------------   
        // Bloque 0: Superbloque | Bloque 1: Bitmap | Bloque 2+: Inodos
        //Ya que no todos los bloques seran para archivos, se reserva una parte para el sistema 5% aprox.
        const systemBlocks = Math.max(3, Math.floor(totalBlocks * 0.05));// Reservamos el 5% del disco para una estructura minima de 3 bloques
        const dataBlocks   = totalBlocks - systemBlocks;

        // Máximo de inodos: 1 inodo por cada 4 bloques de datos 
        const maxInodes = Math.max(16, Math.floor(dataBlocks / 4));

/* ---------------------- Super Bloque ------------------------------------
contiene la informacion general sobre el file system, es como la ficha techica del disco: cuanto espacio hay y cuanto se utilizo ya*/
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

/* ----------------------------- Bitmap ---------------------------------------
cada posicion representa un bloque: 0 es un bloque libre y 1 es un bloque ocupado 
Los bloques del sistema (0..systemBlocks-1) siempre están marcados.*/
        this.blockBitmap = new Array(totalBlocks).fill(0);
        for (let i = 0; i < systemBlocks; i++) {
            this.blockBitmap[i] = 1; // Bloque del sistema → siempre ocupado
        }

/* -------------------------- Bloques Fisicos -----------------------------
Representa un bloque de almacenamiento simulado mediante objetos de JS*/
        //Creamos el bloque
        this.blocks = Array.from({ length: totalBlocks }, (_, i) => ({
            id      : i, // numero de bloque
            data    : i < systemBlocks ? '[SISTEMA]' : null, //que bloque de sistema y que inodo es, osea, que contiene
            inodeId : null,   // inodeID es a que archivo pertence. null = bloque libre
        }));

 /* ------------------   Tabla de Inodos ----------------------- 
 El inodo es la estructura que continene informacion sobre un archivo o un directorio 
 EL inodo sabe donde estan los bloques que pertenecen al archivo*/
        this.inodeTable  = [];
        this.nextInodeId = 0;
        this.initialized = true;

        return this.superblock;
    }


/* ---------------- Allocate Blocks -------------------
Busca los bloques o espacios libres y los reserva*/
    //Usamos el algoritmo: First-Fit" toma los primeros bloques libres y los ocuapa
    allocateBlocks(count) {  //Cuantos bloques ocupamos en el bitmap y los reserva
        if (count <= 0) return []; //Si se pide 0, no hacemos nada
        if (this.superblock.freeBlocks < count) return []; // verifica si existe suficiente espacio. Si esta libre (0), lo cambia a ocupado (1)

        const allocated = []; //Crea un arreglo vacio para guardar los bloques

        // Recorrer el bitmap a partir buscando bloques libres
        for (let i = this.superblock.systemBlocks; i < this.superblock.totalBlocks; i++) { //
            //let i = this.superblock.systemBlocks: no comenzamos desde el bloque 0 porque son los
            //que estan reservados para el sistema

            if (this.blockBitmap[i] === 0) { // Si el bloque esta libre
                this.blockBitmap[i] = 1; // Marcar como ocupado en el bitmap: de 0 a 1
                allocated.push(i); // Guaramos el bloque reservado agregando el numero del bloque al arreglo
                if (allocated.length === count) break; 
                // verifica si ya encontramos la cantidad (count) que ocupamos de bloques en el sistema.
                // si es asi, se tenie el for con el Break
            }
        }

        // Actualizar contadores en el superbloque
        this.superblock.freeBlocks  -= allocated.length;
        this.superblock.usedBlocks  += allocated.length;
        this.superblock.lastModified = new Date().toISOString(); //Actualizamos la fecha de la modificacion

        return allocated; // devolvemos lo que se reservo
    }


    // freeBlocks hace lo contrario a Allocate Blocks
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
        this.superblock.lastModified = new Date().toISOString();  //Actualizamos la fecha de la modificacion
    }

  /*------------------ Creando el Inodo ---------------------- */
    createInode({ name, type, size, blockList, parentDirId, content = '' }) { // Crea un nuevo inodo
        if (this.superblock.freeInodes === 0) { // Revisamos con el superblock si hay inodos disponibles 
            throw new Error('Tabla de inodos llena: no hay inodos disponibles');
        }

        const inode = { // construyendo el inodo con JS
            id          : this.nextInodeId++,       // Número de inodo unico
            name        : name,                      // nombre del archivo o carpeta
            type        : type,                      // verificand si es archvio o directorio
            size        : size,                      // Tamaño que ocupa en bytes
            blocks      : [...blockList],            // Guarda el numero de bloques fisicos donde se guarda el archivo y crea una copia del arreglo
            content     : content,                   // contenido del archivo
            parentDirId : parentDirId,               // Directorio padre, dentro de que carpeta se guardo
            permissions : type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--', // permisos si es directorio o archivo
            //drwxr-xr-x   ->   imita los permisos de Linux/EXT2. Directorio d
            //-rw-r--r--   ->   archivo -
            links       : type === 'dir' ? 2 : 1,   // Contador de hard links, si es directorio 2, si es archivo 1 (sistema Unix)
            uid         : 1000,                      // user id (simulado)
            gid         : 1000,                      // grupo id (simulado)
            //Fechas de crear, modificar y cuando se accedio
            createdAt   : new Date().toISOString(),   
            modifiedAt  : new Date().toISOString(),   
            accessedAt  : new Date().toISOString(),   
        };

        // Registrar en cada bloque físico a qué inodo pertenece
        for (const blockId of blockList) {
            this.blocks[blockId].inodeId = inode.id; // Registra a que inodo pertenece cada bloque 
            this.blocks[blockId].data    = `[Inodo #${inode.id}: ${name}]`; // Guarda una representacion de que archivo ocupa ese bloque 
        }

        this.inodeTable.push(inode); // Agregamos el inodo a la abla
        this.superblock.freeInodes--; //actualizamos los contadores
        this.superblock.usedInodes++;

        return inode;
    }


    // Delete Inodo, aqui eliminamos el inodo de la tabla y liberamos sus bloques físicos.
    deleteInode(inodeId) {
        const idx = this.inodeTable.findIndex(n => n.id === inodeId); // buscamos el inodo, su posicion en el arreglo
        if (idx === -1) return false; // si no existe, devuelve -1

        const inode = this.inodeTable[idx]; // Si se encuentra, devuelve el objeto completo

        
        this.freeBlocks(inode.blocks);// Liberaramos los bloques físicos apuntados por el inodo

        this.inodeTable.splice(idx, 1); // Remuve el inodo de la tabla
        this.superblock.freeInodes++; //actualiazamos apuntadores
        this.superblock.usedInodes--;

        return true;
    }

    // Get Inode, buscamos los inodos
    getInode(inodeId) {
        return this.inodeTable.find(n => n.id === inodeId) ?? null; //buscamos el inodo y devolvemos el objeto completo
    }

    //---------------------- CalcBlocksNeeded ------------------------------------
    //Verificamos cuantos bloques necesitamos para guardar un archivo determinado
    calcBlocksNeeded(sizeBytes) {
        if (sizeBytes <= 0) return 1; //aunque el archivo este vacio siempre reservamos un bloque
        return Math.ceil(sizeBytes / this.superblock.blockSize); //hacemos la conversion y redondea de ser necesario
    }

    //convertimos todo el estado del disco en un texto [string JSON] para guardarlo
    serialize() {
        return JSON.stringify({
            initialized  : this.initialized,
            superblock   : this.superblock,
            blockBitmap  : this.blockBitmap,
            blocks       : this.blocks,
            inodeTable   : this.inodeTable,
            nextInodeId  : this.nextInodeId, // para evitar generar ids duplicados al cerrar el disco
        });
    }

    // convertimos un texto [JSON] a JavaScript
    deserialize(json) {
        const d = JSON.parse(json);
        this.initialized = d.initialized;
        this.superblock  = d.superblock;
        this.blockBitmap = d.blockBitmap;
        this.blocks      = d.blocks;
        this.inodeTable  = d.inodeTable;
        this.nextInodeId = d.nextInodeId;
    }

    //-------------------- Reset -----------------
    //dejamos el disco como recien creado
    reset() {
        this.initialized = false; //el disco ya no esta inicializado
        this.superblock  = null; // eliminamos la info del superbloque
        this.blockBitmap = [];
        this.blocks      = [];
        this.inodeTable  = [];
        this.nextInodeId = 0;  //reiniciamos el Id
    }
}

//Instancia global del disco simulado
const disk = new SimulatedDisk();
