from flask import Flask

from backend.api.routes import api

app = Flask(__name__)
app.register_blueprint(api)


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
