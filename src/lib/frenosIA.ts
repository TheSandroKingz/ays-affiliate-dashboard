import { rateLimitShared } from "./rateLimit";
import { tgEnviar, OWNER_CHAT_ID } from "./telegram";

// FRENOS DE GASTO DE IA, comunes a los 5 bots (15-sep).
// Un jugador amenazó con "gastarte los tokens de la ia", y había dos agujeros:
//  · Los topes por jugador se los saltaba cualquiera que escribiera "retiro" o
//    "saldo" en cada mensaje (excepción pensada para no dejar tirado a quien
//    tiene un problema con su dinero).
//  · No había ningún tope por hora ni ningún freno contra muchas cuentas a la vez.
// Los números salen de 21 días de chats reales:
//  · un mismo jugador recibe como mucho 86 respuestas en una hora y 198 en un día;
//  · entre todos los bots, como mucho 309 respuestas en una hora;
//  · como mucho 31 contactos nuevos en una hora.
// Así que estos topes no tocan a nadie real y cortan un ataque a tiempo.
// Medido sobre 7 días (313 horas-chat): la mediana son 4 respuestas por hora, el
// percentil 99 son 47 y las ÚNICAS dos horas por encima de 60 fueron los dos troles
// (70 y 62). Con 60 no se corta ninguna conversación real, ni siquiera guiando a
// alguien paso a paso, y un troll no puede pasar de ahí. Antes: 100 y 250.
const TOPE_CHAT_HORA = 60;
const TOPE_CHAT_DIA = 200;
const TOPE_GLOBAL_HORA = 400;
const AVISO_GLOBAL_HORA = 250;
const TOPE_NUEVOS_HORA = 120;
const AVISO_NUEVOS_HORA = 60;
const HORA = 60 * 60 * 1000;

// Manda un aviso al dueño como mucho una vez por hora por cada tipo.
async function avisarUnaVez(tipo: string, texto: string): Promise<void> {
  try {
    if (!OWNER_CHAT_ID) return;
    if (await rateLimitShared(`aviso-ia:${tipo}`, 1, HORA)) {
      await tgEnviar(String(OWNER_CHAT_ID), texto).catch(() => {});
    }
  } catch {
    /* un aviso nunca puede romper una respuesta */
  }
}

// ¿Se puede gastar IA en este mensaje? `clave` identifica el chat (y el bot).
// `contactoNuevo`: es la primera vez que escribe (cuenta para el freno de
// avalancha de cuentas nuevas). Devuelve false si toca no llamar a la IA.
export async function puedeGastarIA(clave: string, contactoNuevo: boolean): Promise<boolean> {
  if (!(await rateLimitShared(`aichat:${clave}`, TOPE_CHAT_DIA, 24 * HORA))) return false;
  if (!(await rateLimitShared(`aihora:${clave}`, TOPE_CHAT_HORA, HORA))) return false;

  if (contactoNuevo) {
    const nuevosOk = await rateLimitShared("ia:nuevos:hora", TOPE_NUEVOS_HORA, HORA);
    if (!(await rateLimitShared("ia:nuevos:aviso", AVISO_NUEVOS_HORA, HORA))) {
      await avisarUnaVez(
        "nuevos",
        `⚠️ Están entrando muchos contactos nuevos a la vez (más de ${AVISO_NUEVOS_HORA} en una hora; lo normal son menos de 30). Si no has publicado nada, puede ser un ataque con cuentas falsas. A partir de ${TOPE_NUEVOS_HORA} en una hora, los nuevos no reciben respuesta de la IA.`
      );
    }
    if (!nuevosOk) return false;
  }

  const globalOk = await rateLimitShared("ia:global:hora", TOPE_GLOBAL_HORA, HORA);
  if (!(await rateLimitShared("ia:global:aviso", AVISO_GLOBAL_HORA, HORA))) {
    await avisarUnaVez(
      "global",
      `⚠️ Consumo de IA fuera de lo normal: más de ${AVISO_GLOBAL_HORA} respuestas en la última hora entre todos los bots (lo máximo de un día real han sido unas 300). Si no es un día fuerte, puede ser spam. Tope duro: ${TOPE_GLOBAL_HORA} por hora.`
    );
  }
  if (!globalOk) {
    await avisarUnaVez(
      "tope",
      `🛑 Tope de IA alcanzado: ${TOPE_GLOBAL_HORA} respuestas en una hora entre todos los bots. No contestan con IA hasta que baje.`
    );
    return false;
  }
  return true;
}
