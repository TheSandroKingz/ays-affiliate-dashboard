export default function PrivacidadPage() {
  return (
    <main className="min-h-screen bg-black px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-emerald-400 mb-2">Política de Privacidad</h1>
        <p className="text-slate-400 text-sm mb-8">Última actualización: julio de 2026</p>

        <div className="flex flex-col gap-6 text-slate-300 text-sm leading-relaxed">
          <section>
            <h2 className="text-white text-lg font-semibold mb-2">1. Responsable del tratamiento</h2>
            <p>
              A & S Afiliados es responsable del tratamiento de los datos
              personales que nos facilitas a través de esta plataforma como
              afiliado del programa.
            </p>
          </section>
          <section>
            <h2 className="text-white text-lg font-semibold mb-2">2. Datos que recogemos</h2>
            <p>
              Recogemos tu nombre, correo electrónico, contraseña (almacenada de
              forma cifrada), datos de pago para el cobro de comisiones, y datos
              de actividad de afiliación (clics, registros, depósitos referidos)
              necesarios para calcular tus comisiones.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">3. Finalidad del tratamiento</h2>
            <p>
              Usamos tus datos para gestionar tu cuenta de afiliado, calcular y
              pagar comisiones, comunicarnos contigo sobre tu cuenta, y cumplir
              con obligaciones legales aplicables al sector.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">4. Base legal</h2>
            <p>
              El tratamiento se basa en la ejecución del contrato de afiliación
              entre ambas partes, tu consentimiento explícito, y el cumplimiento
              de obligaciones legales cuando corresponda.
            </p>
          </section>
          <section>
            <h2 className="text-white text-lg font-semibold mb-2">5. Conservación de datos</h2>
            <p>
              Conservamos tus datos mientras tu cuenta esté activa y durante el
              plazo adicional necesario para cumplir obligaciones legales,
              fiscales o para resolver disputas.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">6. Tus derechos</h2>
            <p>
              Puedes ejercer tus derechos de acceso, rectificación, supresión,
              oposición, limitación y portabilidad de tus datos en cualquier
              momento contactando con tu gestor de afiliados. También puedes
              retirar tu consentimiento cuando el tratamiento se base en él,
              aunque esto puede implicar el cierre de tu sesión.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">7. Terceros y encargados del tratamiento</h2>
            <p>
              Utilizamos proveedores de infraestructura (como Supabase) y de
              procesamiento de pagos que actúan como encargados del tratamiento
              bajo nuestras instrucciones. No vendemos tus datos a terceros.
            </p>
          </section>
          <section>
            <h2 className="text-white text-lg font-semibold mb-2">8. Menores de edad</h2>
            <p>
              Esta plataforma no está dirigida a menores de 18 años. No
              recogemos conscientemente datos de menores.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">9. Cambios en esta política</h2>
            <p>
              Podemos actualizar esta política de privacidad periódicamente. Te
              notificaremos de cambios sustanciales a través del panel o por
              correo electrónico.
            </p>
          </section>

          <section>
            <h2 className="text-white text-lg font-semibold mb-2">10. Contacto</h2>
            <p>
              Para ejercer tus derechos o resolver dudas sobre el tratamiento de
              tus datos, contacta con tu gestor de afiliados desde el panel.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
