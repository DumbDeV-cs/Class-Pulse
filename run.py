"""Start the attendance server:  python run.py [--host 0.0.0.0] [--port 5000] [--seed]"""
import argparse

from app import create_app

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=5000)
    ap.add_argument("--seed", action="store_true", help="load demo students and history first")
    args = ap.parse_args()
    if args.seed:
        from app.seed import seed
        seed()
    app = create_app()
print("\n  Attendance system running at \033[1;32mhttp://%s:%d\033[0m\n" % (args.host, args.port))
app.run(host=args.host, port=args.port, threaded=True)
#gg frigging ez
#so nbasically i hope that you can see this shjit easily cuz i dont really frigging care 
#sig+






#NETWORK SO STATIC 
#IM ELASTIC