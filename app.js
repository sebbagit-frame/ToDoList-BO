// =====================================================
// Mis Pendientes - lógica de la app
// Las tareas se guardan en localStorage (solo en este navegador).
// =====================================================

// ----- Constantes -----
const LS_KEY = "pendientes.v1";
const PRIORIDAD_ORDEN = { alta: 0, media: 1, baja: 2 };
const PRIORIDAD_TEXTO = { alta: "Alta", media: "Media", baja: "Baja" };

// ----- Estado -----
// Cada tarea es un objeto:
// { id, title, category, priority, due, done, createdAt, doneAt }
let tareas = cargarTareas();
let filtro = "pending";           // "pending" | "done" | "all"
let idPorConfirmar = null;        // tarea que espera confirmación de borrado
let confirmarBorrarHechas = false;
let timerAviso = null;

// NUEVO: estado de la rutina semanal
const RUTINAS_KEY = "pendientes.rutinas.v1";
let rutinas = cargarRutinas();
let vista = "tareas";                  // "tareas" | "rutina"
let diaSel = new Date().getDay();      // día que se está mirando (0 = domingo ... 6 = sábado)
let idArchivoAbierto = null;           // rutina que tiene abierto el campo "agregar archivo"
let idRutinaPorConfirmar = null;       // rutina que espera confirmación de borrado
let pedirFoco = false;                 // para llevar el cursor al campo de archivo
let archivosNuevos = [];               // nombres de archivo del formulario "Nueva rutina"

// ----- Atajos para el DOM -----
const $ = (id) => document.getElementById(id);

function crear(tag, clase) {
  const nodo = document.createElement(tag);
  if (clase) nodo.className = clase;
  return nodo;
}

// ----- Fechas -----
// Las fechas se guardan como texto "AAAA-MM-DD" (lo que devuelve <input type="date">).
function pad(n) { return String(n).padStart(2, "0"); }

function fechaATexto(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function hoy() { return fechaATexto(new Date()); }

function manana() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return fechaATexto(d);
}

function textoAFecha(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d); // fecha en hora local, sin corrimientos de zona horaria
}

function formatearFecha(s) {
  return new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short" })
    .format(textoAFecha(s))
    .replace(",", "");
}

// ----- localStorage -----
function cargarTareas() {
  try {
    const datos = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    return Array.isArray(datos) ? datos : [];
  } catch {
    return [];
  }
}

function guardarTareas() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(tareas));
  } catch {
    avisar("No se pudo guardar en este navegador.");
  }
}

function avisar(mensaje) {
  $("notice").textContent = mensaje;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => { $("notice").textContent = ""; }, 6000);
}

// ----- Acciones sobre las tareas -----
function nuevoId() {
  return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function agregarTarea(datos) {
  tareas.push({ id: nuevoId(), ...datos });
  guardarTareas();
  render();
}

function alternarHecha(id) {
  tareas = tareas.map((t) =>
    t.id === id ? { ...t, done: !t.done, doneAt: t.done ? null : Date.now() } : t
  );
  guardarTareas();
  render();
}

function borrarTarea(id) {
  tareas = tareas.filter((t) => t.id !== id);
  guardarTareas();
  render();
}

function borrarHechas() {
  tareas = tareas.filter((t) => !t.done);
  guardarTareas();
  render();
}

// ----- Orden -----
// Pendientes: primero las de fecha más cercana (las sin fecha al final), después por prioridad.
function ordenPendientes(a, b) {
  const fa = a.due || "9999-99-99";
  const fb = b.due || "9999-99-99";
  if (fa !== fb) return fa < fb ? -1 : 1;

  const pa = PRIORIDAD_ORDEN[a.priority] ?? 1;
  const pb = PRIORIDAD_ORDEN[b.priority] ?? 1;
  if (pa !== pb) return pa - pb;

  return (a.createdAt || 0) - (b.createdAt || 0);
}

// Hechas: las terminadas más recientemente primero.
function ordenHechas(a, b) {
  return (b.doneAt || 0) - (a.doneAt || 0);
}

// ----- Texto de la fecha límite -----
function infoFecha(t) {
  if (!t.due) return null;
  const texto = formatearFecha(t.due);

  if (t.done) return { clase: "", texto };
  if (t.due < hoy()) return { clase: "overdue", texto: "Vencida · " + texto };
  if (t.due === hoy()) return { clase: "today", texto: "Vence hoy" };
  if (t.due === manana()) return { clase: "", texto: "Mañana · " + texto };
  return { clase: "", texto };
}

// ----- Íconos (SVG fijos, no llevan datos del usuario) -----
const SVG_CHECK =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const SVG_TACHO =
  '<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path d="M2.5 4.5h11M6 4.5V3h4v1.5M4.2 4.5l.6 8.5h6.4l.6-8.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ----- Dibujar una fila de la lista -----
function crearFila(t) {
  const li = crear("li", "task" + (t.done ? " done" : ""));

  // Casilla de check
  const check = crear("button", "check");
  check.type = "button";
  check.setAttribute("role", "checkbox");
  check.setAttribute("aria-checked", String(!!t.done));
  check.setAttribute("aria-label", (t.done ? "Marcar como pendiente: " : "Marcar como hecha: ") + t.title);
  check.innerHTML = `<span class="box">${SVG_CHECK}</span>`;
  check.addEventListener("click", () => alternarHecha(t.id));

  // Título y datos
  const cuerpo = crear("div", "body");

  const titulo = crear("div", "title");
  titulo.textContent = t.title; // textContent evita que el texto se interprete como HTML

  const meta = crear("div", "meta");

  const categoria = crear("span", "cat");
  categoria.textContent = t.category || "General";
  meta.appendChild(categoria);

  const fecha = infoFecha(t);
  if (fecha) {
    const chip = crear("span", "due" + (fecha.clase ? " " + fecha.clase : ""));
    chip.textContent = fecha.texto;
    meta.appendChild(chip);
  }

  if (!t.done && PRIORIDAD_TEXTO[t.priority]) {
    const prio = crear("span", "prio prio-" + t.priority);
    prio.appendChild(crear("i"));
    prio.appendChild(document.createTextNode("Prioridad " + PRIORIDAD_TEXTO[t.priority].toLowerCase()));
    meta.appendChild(prio);
  }

  cuerpo.appendChild(titulo);
  cuerpo.appendChild(meta);

  // Botón de borrar (pide confirmación con un segundo clic)
  const borrar = crear("button", "del" + (idPorConfirmar === t.id ? " confirm" : ""));
  borrar.type = "button";

  if (idPorConfirmar === t.id) {
    borrar.textContent = "¿Borrar?";
    borrar.setAttribute("aria-label", "Confirmar borrado de " + t.title);
    borrar.addEventListener("click", () => {
      idPorConfirmar = null;
      borrarTarea(t.id);
    });
  } else {
    borrar.innerHTML = SVG_TACHO;
    borrar.setAttribute("aria-label", "Borrar " + t.title);
    borrar.addEventListener("click", () => {
      idPorConfirmar = t.id;
      render();
      setTimeout(() => {
        if (idPorConfirmar === t.id) { idPorConfirmar = null; render(); }
      }, 3500);
    });
  }

  li.appendChild(check);
  li.appendChild(cuerpo);
  li.appendChild(borrar);
  return li;
}

// ----- Mensaje cuando no hay tareas para mostrar -----
function crearVacio() {
  const caja = crear("div", "empty");
  const titulo = document.createElement("strong");
  const detalle = document.createElement("span");

  if (filtro === "done") {
    titulo.textContent = "Todavía no marcaste ninguna como hecha.";
    detalle.textContent = "Cuando termines una, tildala y aparece acá.";
  } else if (filtro === "all") {
    titulo.textContent = "No hay tareas cargadas.";
    detalle.textContent = "Escribí la primera arriba y tocá Agregar.";
  } else {
    titulo.textContent = "No tenés pendientes.";
    detalle.textContent = "Escribí una tarea arriba y tocá Agregar.";
  }

  caja.appendChild(titulo);
  caja.appendChild(detalle);
  return caja;
}

// ----- Dibujar toda la pantalla -----
function render() {
  const pendientes = tareas.filter((t) => !t.done);
  const hechas = tareas.filter((t) => t.done);

  // Contadores de las pestañas
  $("n-pending").textContent = pendientes.length;
  $("n-done").textContent = hechas.length;
  $("n-all").textContent = tareas.length;

  // Resumen de arriba
  const resumen = $("summary");
  resumen.textContent = "";

  if (vista === "rutina") {
    resumen.textContent = textoResumenRutina(); // NUEVO
  } else if (!pendientes.length) {
    resumen.textContent = tareas.length ? "Todo al día." : "Sin tareas por ahora.";
  } else {
    const vencidas = pendientes.filter((t) => t.due && t.due < hoy()).length;
    const paraHoy = pendientes.filter((t) => t.due === hoy()).length;

    const negrita = document.createElement("b");
    negrita.textContent = pendientes.length + (pendientes.length === 1 ? " pendiente" : " pendientes");
    resumen.appendChild(negrita);

    if (vencidas) {
      const rojo = crear("span", "bad");
      rojo.textContent = vencidas + (vencidas === 1 ? " vencida" : " vencidas");
      resumen.appendChild(document.createTextNode(" · "));
      resumen.appendChild(rojo);
    }
    if (paraHoy) {
      resumen.appendChild(
        document.createTextNode(" · " + paraHoy + (paraHoy === 1 ? " vence hoy" : " vencen hoy"))
      );
    }
  }

  // Pestaña activa
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.setAttribute("aria-selected", String(tab.dataset.filter === filtro));
  });

  // Qué tareas mostrar según el filtro
  let visibles;
  if (filtro === "pending") {
    visibles = [...pendientes].sort(ordenPendientes);
  } else if (filtro === "done") {
    visibles = [...hechas].sort(ordenHechas);
  } else {
    visibles = [...pendientes].sort(ordenPendientes).concat([...hechas].sort(ordenHechas));
  }

  // Lista
  const zona = $("list-area");
  zona.textContent = "";

  if (!visibles.length) {
    zona.appendChild(crearVacio());
  } else {
    const ul = crear("ul", "list");
    visibles.forEach((t) => ul.appendChild(crearFila(t)));
    zona.appendChild(ul);
  }

  // Botón "Borrar hechas"
  const boton = $("clear-done");
  boton.hidden = vista !== "tareas" || hechas.length === 0;
  boton.className = "clear" + (confirmarBorrarHechas ? " confirm" : "");
  boton.textContent = confirmarBorrarHechas
    ? "¿Borrar " + hechas.length + (hechas.length === 1 ? " hecha?" : " hechas?")
    : "Borrar hechas";

  renderRutina(); // NUEVO
}

// ----- Eventos -----
// Agregar tarea
$("add-form").addEventListener("submit", (e) => {
  e.preventDefault();

  const input = $("new-title");
  const titulo = input.value.trim();
  if (!titulo) { input.focus(); return; }

  agregarTarea({
    title: titulo,
    category: $("new-cat").value,
    priority: $("new-prio").value,
    due: $("new-due").value,
    done: false,
    createdAt: Date.now(),
    doneAt: null,
  });

  input.value = "";
  $("new-due").value = "";
  input.focus();
});

// Cambiar de pestaña
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    filtro = tab.dataset.filter;
    render();
  });
});

// Borrar hechas (con confirmación)
$("clear-done").addEventListener("click", () => {
  if (!confirmarBorrarHechas) {
    confirmarBorrarHechas = true;
    render();
    setTimeout(() => {
      if (confirmarBorrarHechas) { confirmarBorrarHechas = false; render(); }
    }, 3500);
    return;
  }
  confirmarBorrarHechas = false;
  borrarHechas();
});

// =====================================================
// NUEVO: Rutina semanal
// Cada rutina es un objeto:
// { id, title, days, slot, files, doneDates, createdAt }
//   days:      números de día de JavaScript (0 = domingo, 1 = lunes ... 6 = sábado)
//   slot:      momento del día (ver MOMENTOS)
//   files:     solo los NOMBRES de los archivos que usa, por ejemplo ["Ventas.xlsx"]
//   doneDates: fechas en las que la marcaste como hecha ("AAAA-MM-DD")
// =====================================================

const DIAS_ORDEN = [1, 2, 3, 4, 5, 6, 0]; // la semana empieza el lunes
const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const MOMENTOS = {
  primera:    { texto: "Primera hora",         orden: 0 },
  manana:     { texto: "Mañana",               orden: 1 },
  mediodia:   { texto: "Mediodía",             orden: 2 },
  tarde:      { texto: "Tarde",                orden: 3 },
  cierre:     { texto: "Cierre del día",       orden: 4 },
  cualquiera: { texto: "En cualquier momento", orden: 5 },
};

// ----- localStorage de las rutinas -----
function cargarRutinas() {
  try {
    const datos = JSON.parse(localStorage.getItem(RUTINAS_KEY) || "[]");
    return Array.isArray(datos) ? datos : [];
  } catch {
    return [];
  }
}

function guardarRutinas() {
  try {
    localStorage.setItem(RUTINAS_KEY, JSON.stringify(rutinas));
  } catch {
    avisar("No se pudo guardar en este navegador.");
  }
}

// ----- Helpers -----
function diaHoy() { return new Date().getDay(); }

// Convierte [1,2,3,4,5] en "Lun a Vie", [4] en "Jue", [1,3,5] en "Lun, Mié, Vie"
function resumenDias(dias) {
  const orden = DIAS_ORDEN.filter((d) => dias.includes(d));
  if (orden.length === 7) return "Todos los días";

  if (orden.length >= 3) {
    const posiciones = orden.map((d) => DIAS_ORDEN.indexOf(d));
    const seguidos = posiciones.every((p, i) => i === 0 || p === posiciones[i - 1] + 1);
    if (seguidos) return DIAS_CORTO[orden[0]] + " a " + DIAS_CORTO[orden[orden.length - 1]];
  }
  return orden.map((d) => DIAS_CORTO[d]).join(", ");
}

// Rutinas que tocan ese día, ordenadas por momento del día
function rutinasDelDia(dia) {
  return rutinas
    .filter((r) => (r.days || []).includes(dia))
    .sort((a, b) => {
      const ma = MOMENTOS[a.slot] ? MOMENTOS[a.slot].orden : 5;
      const mb = MOMENTOS[b.slot] ? MOMENTOS[b.slot].orden : 5;
      if (ma !== mb) return ma - mb;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
}

function estaHechaHoy(r) {
  return (r.doneDates || []).includes(hoy());
}

function textoResumenRutina() {
  const deHoy = rutinasDelDia(diaHoy());
  if (!deHoy.length) return "Hoy no tenés rutinas cargadas.";

  const hechas = deHoy.filter(estaHechaHoy).length;
  if (hechas === deHoy.length) return "Rutina de hoy completa.";
  return `Rutina de hoy: ${hechas} de ${deHoy.length} hechas.`;
}

// ----- Acciones -----
// El check de una rutina vale solo para HOY: mañana aparece destildada otra vez.
function alternarRutinaHoy(id) {
  rutinas = rutinas.map((r) => {
    if (r.id !== id) return r;
    const fechas = r.doneDates || [];
    const nuevas = fechas.includes(hoy())
      ? fechas.filter((f) => f !== hoy())
      : [...fechas, hoy()].slice(-90); // guardamos como mucho las últimas 90 fechas
    return { ...r, doneDates: nuevas };
  });
  guardarRutinas();
  render();
}

function borrarRutina(id) {
  rutinas = rutinas.filter((r) => r.id !== id);
  guardarRutinas();
  render();
}

function agregarArchivo(id, nombre) {
  const limpio = nombre.trim();
  if (!limpio) return;

  rutinas = rutinas.map((r) => {
    if (r.id !== id) return r;
    const archivos = r.files || [];
    const repetido = archivos.some((f) => f.toLowerCase() === limpio.toLowerCase());
    return repetido ? r : { ...r, files: [...archivos, limpio] };
  });
  guardarRutinas();
  render();
}

function quitarArchivo(id, nombre) {
  rutinas = rutinas.map((r) =>
    r.id === id ? { ...r, files: (r.files || []).filter((f) => f !== nombre) } : r
  );
  guardarRutinas();
  render();
}

// ----- Dibujar -----
// Cuadradito con el nombre de un archivo y una "×" para quitarlo
function crearChipArchivo(nombre, alQuitar) {
  const chip = crear("span", "chip");

  const texto = crear("span", "chip-name");
  texto.textContent = nombre;

  const x = crear("button", "chip-x");
  x.type = "button";
  x.textContent = "×";
  x.setAttribute("aria-label", "Quitar archivo " + nombre);
  x.addEventListener("click", alQuitar);

  chip.appendChild(texto);
  chip.appendChild(x);
  return chip;
}

function crearFilaRutina(r, esHoy) {
  const hecha = esHoy && estaHechaHoy(r);
  const li = crear("li", "task" + (hecha ? " done" : ""));

  // Primera columna: el check (solo si se está mirando el día de hoy)
  let primera;
  if (esHoy) {
    primera = crear("button", "check");
    primera.type = "button";
    primera.setAttribute("role", "checkbox");
    primera.setAttribute("aria-checked", String(hecha));
    primera.setAttribute("aria-label", (hecha ? "Marcar como pendiente: " : "Marcar como hecha: ") + r.title);
    primera.innerHTML = `<span class="box">${SVG_CHECK}</span>`;
    primera.addEventListener("click", () => alternarRutinaHoy(r.id));
  } else {
    primera = crear("div"); // espacio vacío para mantener la grilla
  }

  // Segunda columna: título, días y archivos
  const cuerpo = crear("div", "body");

  const titulo = crear("div", "title");
  titulo.textContent = r.title;

  const meta = crear("div", "meta");
  const dias = crear("span", "cat");
  dias.textContent = resumenDias(r.days || []);
  meta.appendChild(dias);

  cuerpo.appendChild(titulo);
  cuerpo.appendChild(meta);

  const chips = crear("div", "chips");
  (r.files || []).forEach((nombre) => {
    chips.appendChild(crearChipArchivo(nombre, () => quitarArchivo(r.id, nombre)));
  });
  cuerpo.appendChild(chips);

  if (idArchivoAbierto === r.id) {
    // Campo para escribir el nombre de un archivo nuevo
    const form = crear("form", "file-add");

    const input = crear("input");
    input.type = "text";
    input.maxLength = 120;
    input.placeholder = "Nombre del archivo";
    input.setAttribute("aria-label", "Nombre del archivo para " + r.title);

    const agregar = crear("button", "btn-small primary");
    agregar.type = "submit";
    agregar.textContent = "Agregar";

    const listo = crear("button", "btn-small");
    listo.type = "button";
    listo.textContent = "Listo";
    listo.addEventListener("click", () => { idArchivoAbierto = null; render(); });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!input.value.trim()) { input.focus(); return; }
      pedirFoco = true; // después de agregar, el cursor vuelve al campo
      agregarArchivo(r.id, input.value);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { idArchivoAbierto = null; render(); }
    });

    form.appendChild(input);
    form.appendChild(agregar);
    form.appendChild(listo);
    cuerpo.appendChild(form);

    if (pedirFoco) {
      pedirFoco = false;
      setTimeout(() => input.focus(), 0);
    }
  } else {
    const abrir = crear("button", "link-btn");
    abrir.type = "button";
    abrir.textContent = "+ Archivo";
    abrir.setAttribute("aria-label", "Agregar archivo a " + r.title);
    abrir.addEventListener("click", () => {
      idArchivoAbierto = r.id;
      pedirFoco = true;
      render();
    });
    cuerpo.appendChild(abrir);
  }

  // Tercera columna: borrar (con confirmación)
  const borrar = crear("button", "del" + (idRutinaPorConfirmar === r.id ? " confirm" : ""));
  borrar.type = "button";

  if (idRutinaPorConfirmar === r.id) {
    borrar.textContent = "¿Borrar?";
    borrar.setAttribute("aria-label", "Confirmar borrado de " + r.title);
    borrar.addEventListener("click", () => {
      idRutinaPorConfirmar = null;
      borrarRutina(r.id);
    });
  } else {
    borrar.innerHTML = SVG_TACHO;
    borrar.setAttribute("aria-label", "Borrar " + r.title);
    borrar.addEventListener("click", () => {
      idRutinaPorConfirmar = r.id;
      render();
      setTimeout(() => {
        if (idRutinaPorConfirmar === r.id) { idRutinaPorConfirmar = null; render(); }
      }, 3500);
    });
  }

  li.appendChild(primera);
  li.appendChild(cuerpo);
  li.appendChild(borrar);
  return li;
}

function renderRutina() {
  // Qué sección se ve
  $("vista-tareas").hidden = vista !== "tareas";
  $("vista-rutina").hidden = vista !== "rutina";
  document.querySelectorAll(".vista-tab").forEach((tab) => {
    tab.setAttribute("aria-selected", String(tab.dataset.vista === vista));
  });

  // Números de las pestañas: pendientes y rutinas que faltan hoy
  $("n-vista-tareas").textContent = tareas.filter((t) => !t.done).length;
  $("n-vista-rutina").textContent = rutinasDelDia(diaHoy()).filter((r) => !estaHechaHoy(r)).length;

  // Pestañas de días (Lun a Dom)
  const pestanias = $("dias-tabs");
  pestanias.textContent = "";
  DIAS_ORDEN.forEach((d) => {
    const boton = crear("button", "dia-tab" + (d === diaHoy() ? " es-hoy" : ""));
    boton.type = "button";
    boton.setAttribute("role", "tab");
    boton.setAttribute("aria-selected", String(d === diaSel));
    boton.setAttribute("aria-label", DIAS_LARGO[d] + (d === diaHoy() ? " (hoy)" : ""));
    boton.textContent = DIAS_CORTO[d];
    boton.addEventListener("click", () => { diaSel = d; render(); });
    pestanias.appendChild(boton);
  });

  const esHoy = diaSel === diaHoy();
  $("dia-nota").textContent = esHoy
    ? "Hoy es " + DIAS_LARGO[diaSel] + ". Tildá lo que ya hiciste: mañana se destilda solo."
    : "Estás viendo el " + DIAS_LARGO[diaSel] + ". Solo se puede tildar el día de hoy.";

  // Lista del día, agrupada por momento
  const zona = $("rutina-lista");
  zona.textContent = "";
  const delDia = rutinasDelDia(diaSel);

  if (!delDia.length) {
    const caja = crear("div", "empty");
    const titulo = document.createElement("strong");
    titulo.textContent = "No hay rutinas cargadas para el " + DIAS_LARGO[diaSel] + ".";
    const detalle = document.createElement("span");
    detalle.textContent = "Cargá una con el formulario de abajo.";
    caja.appendChild(titulo);
    caja.appendChild(detalle);
    zona.appendChild(caja);
  } else {
    const ul = crear("ul", "list");
    let ultimoMomento = null;
    delDia.forEach((r) => {
      const momento = MOMENTOS[r.slot] ? r.slot : "cualquiera";
      if (momento !== ultimoMomento) {
        const encabezado = crear("li", "grupo");
        encabezado.textContent = MOMENTOS[momento].texto;
        ul.appendChild(encabezado);
        ultimoMomento = momento;
      }
      ul.appendChild(crearFilaRutina(r, esHoy));
    });
    zona.appendChild(ul);
  }

  // Archivos que se van sumando en el formulario "Nueva rutina"
  const contenedor = $("r-files");
  contenedor.textContent = "";
  archivosNuevos.forEach((nombre) => {
    contenedor.appendChild(
      crearChipArchivo(nombre, () => {
        archivosNuevos = archivosNuevos.filter((n) => n !== nombre);
        render();
      })
    );
  });
}

// ----- Eventos de la rutina semanal -----
// Cambiar de sección
document.querySelectorAll(".vista-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    vista = tab.dataset.vista;
    render();
  });
});

// Atajos de días: Lun a Vie / Todos / Limpiar
document.querySelectorAll("[data-preset]").forEach((boton) => {
  boton.addEventListener("click", () => {
    const preset = boton.dataset.preset;
    document.querySelectorAll('input[name="r-day"]').forEach((casilla) => {
      const d = Number(casilla.value);
      if (preset === "todos") casilla.checked = true;
      else if (preset === "ninguno") casilla.checked = false;
      else casilla.checked = d >= 1 && d <= 5;
    });
  });
});

// Sumar un nombre de archivo al formulario (botón "Agregar" o tecla Enter)
function sumarArchivoAlFormulario() {
  const input = $("r-file");
  const nombre = input.value.trim();
  if (!nombre) { input.focus(); return; }

  const repetido = archivosNuevos.some((n) => n.toLowerCase() === nombre.toLowerCase());
  if (!repetido) archivosNuevos.push(nombre);

  input.value = "";
  input.focus();
  render();
}

$("r-file-add").addEventListener("click", sumarArchivoAlFormulario);
$("r-file").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault(); // evita que Enter guarde toda la rutina
    sumarArchivoAlFormulario();
  }
});

// Guardar la rutina
$("rutina-form").addEventListener("submit", (e) => {
  e.preventDefault();

  const input = $("r-title");
  const titulo = input.value.trim();
  if (!titulo) { input.focus(); return; }

  const dias = [...document.querySelectorAll('input[name="r-day"]:checked')].map((c) => Number(c.value));
  if (!dias.length) { avisar("Elegí al menos un día para la rutina."); return; }

  // Si dejó un nombre escrito sin tocar "Agregar", lo sumamos igual
  const archivos = [...archivosNuevos];
  const suelto = $("r-file").value.trim();
  if (suelto && !archivos.some((n) => n.toLowerCase() === suelto.toLowerCase())) archivos.push(suelto);

  rutinas.push({
    id: nuevoId(),
    title: titulo,
    days: dias,
    slot: $("r-slot").value,
    files: archivos,
    doneDates: [],
    createdAt: Date.now(),
  });
  guardarRutinas();

  // Limpiamos el formulario y mostramos un día en el que la rutina aparezca
  input.value = "";
  $("r-file").value = "";
  archivosNuevos = [];
  if (!dias.includes(diaSel)) {
    diaSel = dias.includes(diaHoy()) ? diaHoy() : DIAS_ORDEN.find((d) => dias.includes(d));
  }
  render();
  input.focus();
});

// ----- Arranque -----
$("today").textContent = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
}).format(new Date());

render();