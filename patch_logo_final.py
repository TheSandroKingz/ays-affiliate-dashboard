path = "src/app/login/page.tsx"
with open(path) as f:
    content = f.read()

old_import = "import Image from 'next/image'\n"
if old_import in content:
    content = content.replace(old_import, "")
    print("OK: import Image removido")
else:
    print("AVISO: import no encontrado")

old_div_open = '<div className="text-center mb-6 flex justify-center">'
new_div_open = '<div className="text-center mb-8 flex flex-col items-center">'
if old_div_open in content:
    content = content.replace(old_div_open, new_div_open)
    print("OK: div contenedor actualizado")
else:
    print("AVISO: div contenedor no encontrado")

old_image_line = '<Image src="/logo.png" alt="A&S Afiliados" width={340} height={179} className="rounded-xl" priority />'
new_logo = '''<div className="flex items-end justify-center leading-none">
            <span className="text-white font-black text-7xl">A</span>
            <span className="relative text-emerald-400 font-black text-7xl mx-1">
              &
              <svg viewBox="0 0 24 24" className="absolute left-1/2 -translate-x-1/2 -top-3 w-7 h-7 fill-black">
                <path d="M12 2C12 2 4 9 4 14a4 4 0 0 0 7 2.65C10.44 19.32 9 21 6 21h12c-3 0-4.44-1.68-5-4.35A4 4 0 0 0 20 14c0-5-8-12-8-12z"/>
              </svg>
            </span>
            <span className="text-white font-black text-7xl">S</span>
          </div>
          <div className="text-emerald-400 font-bold tracking-[0.4em] text-lg mt-2">AFILIADOS</div>'''

if old_image_line in content:
    content = content.replace(old_image_line, new_logo)
    print("OK: logo reemplazado por texto/CSS")
else:
    print("ERROR: no se encontro la linea Image")

with open(path, "w") as f:
    f.write(content)
