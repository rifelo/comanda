import type { Metadata } from "next";
import { Wordmark } from "@/components/comanda/primitives";

export const metadata: Metadata = { title: "Política de privacidad · Comanda" };

const CONTACTO = "jesusvallecilla27@gmail.com";

/** Public privacy policy — Google's sign-in consent screen links here. */
export default function PrivacidadPage() {
  return (
    <main className="cmd-paper min-h-screen px-6 pt-16 pb-16">
      <article className="mx-auto w-full max-w-2xl space-y-5 leading-relaxed" style={{ fontSize: 15 }}>
        <Wordmark size={40} />
        <h1 className="font-slab" style={{ fontSize: 28 }}>Política de privacidad</h1>
        <p className="text-muted" style={{ fontSize: 13 }}>Última actualización: 31 de octubre de 2026</p>

        <p>
          Comanda (co-manda.com) es la herramienta interna con la que los negocios que la usan, como Café Pa&apos; Yo,
          manejan sus turnos, ventas e inventario. Esta política explica qué datos personales tratamos y para qué, de
          acuerdo con la Ley 1581 de 2012 de Colombia.
        </p>

        <h2 className="font-slab" style={{ fontSize: 18 }}>Qué datos usamos</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b>Inicio de sesión con Google:</b> solo tu nombre, tu correo y tu foto de perfil, para identificarte dentro
            de la aplicación. No accedemos a tu correo, tus contactos, tus archivos ni a ningún otro dato de tu cuenta
            de Google.
          </li>
          <li>
            <b>Equipo del negocio:</b> los turnos, tareas, ventas y registros de caja o inventario que hagas en la
            aplicación, asociados a tu usuario.
          </li>
          <li>
            <b>Clientes:</b> si dejas una calificación o tu usuario para acumular puntos, guardamos ese usuario, la
            calificación y el comentario que escribas.
          </li>
        </ul>

        <h2 className="font-slab" style={{ fontSize: 18 }}>Para qué los usamos</h2>
        <p>
          Únicamente para que la aplicación funcione: iniciar sesión, mostrar a cada persona sus turnos y llevar las
          cuentas del negocio. No vendemos ni compartimos datos personales con terceros con fines publicitarios.
        </p>

        <h2 className="font-slab" style={{ fontSize: 18 }}>Dónde se guardan</h2>
        <p>
          En proveedores de infraestructura en la nube (alojamiento web y base de datos) que procesan los datos por
          cuenta nuestra y bajo medidas de seguridad estándar.
        </p>

        <h2 className="font-slab" style={{ fontSize: 18 }}>Tus derechos</h2>
        <p>
          Puedes pedir conocer, corregir o eliminar tus datos, o revocar tu autorización, escribiendo a{" "}
          <a className="underline" href={`mailto:${CONTACTO}`}>{CONTACTO}</a>. Respondemos en un plazo máximo de 15
          días hábiles.
        </p>
      </article>
    </main>
  );
}
