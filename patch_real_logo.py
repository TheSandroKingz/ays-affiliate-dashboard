path = "src/app/login/page.tsx"
with open(path) as f:
    content = f.read()

old_import_anchor = "import { Mail, Lock, Eye, EyeOff } from 'lucide-react'\n"
new_import = old_import_anchor + "import Image from 'next/image'\n"
if "import Image from 'next/image'" not in content:
    content = content.replace(old_import_anchor, new_import)
    print("OK: import Image agregado")
else:
    print("AVISO: import Image ya existe")

old_block = '''<div className="text-center mb-8 flex flex-col items-center">
          <div className="flex items-end justify-center leading-none">
            <span className="text-white font-black text-7xl">A</span>
            <span className="relative text-emerald-400 font-black text-7xl mx-1">
              &
              <svg viewBox="0 0 24 24" className="absolute left-1/2 -translate-x-1/2 -top-3 w-7 h-7 fill-black">
                <path d="M12 2C12 2 4 9 4 14a4 4 0 0 0 7 2.65C10.44 19.32 9 21 6 21h12c-3 0-4.44-1.68-5-4.35A4 4 0 0 0 20 14c0-5-8-12-8-12z"/>
              </svg>
            </span>
            <span className="text-white font-black text-7xl">S</span>
          </div>
          <div className="text-emerald-400 font-bold tracking-[0.4em] text-lg mt-2">AFILIADOS</div>
        </div>'''

new_block = '''<div className="text-center mb-8 flex justify-center">
          <Image src="/logo.png" alt="A&S Afiliados" width={420} height={206} className="rounded-xl" priority />
        </div>'''

if old_block in content:
    content = content.replace(old_block, new_block)
    print("OK: logo real (imagen) colocado")
else:
    print("ERROR: no se encontro el bloque de texto/CSS")

with open(path, "w") as f:
    f.write(content)
