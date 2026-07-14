export default function TerminosPage() {
  return (
    <main className="min-h-screen bg-black px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-emerald-400 mb-2">Términos y Condiciones</h1>
        <p className="text-slate-400 text-sm mb-8">Última actualización: julio de 2026</p>

        <div className="flex flex-col gap-6 text-slate-300 text-sm leading-relaxed">
          <section>
            <h2 className="text-white text-lg font-semibold mb-2">1. Aceptación de los términos</h2>
            <p>
              Al registrarte y utilizar el programa de afiliados de A & S Afiliados
              ("nosotros", "la plataforma"), aceptas quedar vinculado por estos
              Términos y Condiciones. Si no estás de acuerdo, no debes utilizar
              la plataforma.
            </p>
          </section>
          <section>
            <h2 className="text-white text-lg font-semibold mb-2">2. Descripción del servicio</h2>
            <p>
              A & S Afiliados es un programa de marketing de afiliación mediante el
              cual promocionas casinos y plataformas de apuestas de terceros a
              cambio de una comisión sobre la actividad generada por los usuarios
              que refieras. No somos un operador de juego ni procesamos apuestas.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">3. Elegibilidad y edad mínima</h2>
            <p>
              Debes ser mayor de 18 años (o la edad legal de mayoría en tu país,
              si es superior) para registrarte como afiliado. Eres responsable de
              asegurarte de que el tráfico que generas cumple con la edad mínima
              legal exigida en la jurisdicción de cada usuario referido.
            </p>
          </section>
          <section>
            <h2 className="text-white text-lg font-semibold mb-2">4. Comisiones y pagos</h2>
            <p>
              Las comisiones se calculan según el plan de comisión asignado a tu
              cuenta y se muestran en tu panel de afiliado. Los pagos se procesan
              conforme a los términos indicados en la sección de Pagos. Nos
              reservamos el derecho de retener o anular comisiones generadas por
              tráfico fraudulento, inválido o que incumpla estos términos.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">5. Conducta prohibida</h2>
            <p>
              Queda prohibido el uso de tráfico incentivado no autorizado, bots,
              spam, publicidad engañosa, o dirigir tráfico desde jurisdicciones
              donde el juego online esté prohibido. El incumplimiento puede
              conllevar la suspensión inmediata de la cuenta y la anulación de
              comisiones pendientes.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">6. Juego responsable</h2>
            <p>
              Como afiliado, te comprometes a promocionar el juego de forma
              responsable, incluyendo mensajes de juego responsable cuando el
              operador lo exija, y a no dirigir campañas hacia menores de edad
              o personas que hayan solicitado autoexclusión.
            </p>
          </section>
          <section>
            <h2 className="text-white text-lg font-semibold mb-2">7. Terminación de cuenta</h2>
            <p>
              Podemos suspender o cancelar tu cuenta en cualquier momento si
              incumples estos términos, sin perjuicio de las comisiones legítimas
              ya devengadas antes de la infracción.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">8. Limitación de responsabilidad</h2>
            <p>
              La plataforma se ofrece "tal cual". No garantizamos ingresos mínimos
              ni la disponibilidad continua del servicio. No somos responsables
              de las acciones de los operadores de casino con los que trabajas
              como afiliado.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">9. Modificaciones</h2>
            <p>
              Podemos actualizar estos términos en cualquier momento. Te
              notificaremos de cambios relevantes y el uso continuado de la
              plataforma implica la aceptación de la versión actualizada.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">10. Contacto</h2>
            <p>
              Para cualquier duda sobre estos términos, contacta con tu gestor
              de afiliados desde el panel.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
