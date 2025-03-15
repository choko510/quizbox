import datetime
import io
import json
import os
import random
from contextlib import asynccontextmanager
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from PIL import Image
import aiofiles
import xxhash
import numpy as np
import google.generativeai as genai

from sqlalchemy import Column, Integer, String
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.future import select
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

if not os.getenv("GEMINI_APIKEY") or os.getenv("GEMINI_APIKEY") == "":
    if not os.path.exists(".env"):
        raise ValueError("Please create .env file")
    else:
        raise ValueError("Please set GEMINI_APIKEY in .env file")

genai.configure(api_key=os.getenv("GEMINI_APIKEY"))

DATABASE_URL = "sqlite+aiosqlite:///data.db"
engine = create_async_engine(DATABASE_URL)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()

class Account(Base):
    __tablename__ = 'user'
    userid = Column(String, primary_key=True)
    password = Column(String)
    correct = Column(Integer)
    bad = Column(Integer)
    correctdata = Column(String)
    baddata = Column(String)

class Mondai(Base):
    __tablename__ = 'mondai'
    name = Column(String, primary_key=True)
    userid = Column(String)
    mondai = Column(String)


templates = Jinja2Templates(directory="templates")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # アプリ起動時の処理（startup）
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 非同期 DB 操作用クラス
class DB:
    @staticmethod
    async def password(id: str):
        async with async_session() as session:
            result = await session.execute(select(Account).filter_by(userid=id))
            user = result.scalar_one_or_none()
            return user.password if user else None

    @staticmethod
    async def registration(id: str, password: str):
        async with async_session() as session:
            user = Account(
                userid=id,
                correct=0,
                bad=0,
                password=password,
                correctdata="{}",
                baddata="{}"
            )
            session.add(user)
            await session.commit()

    @staticmethod
    async def get_correct(id: str):
        async with async_session() as session:
            result = await session.execute(select(Account).filter_by(userid=id))
            user = result.scalar_one_or_none()
            return user.correct if user else None

    @staticmethod
    async def add_correct(id: str):
        async with async_session() as session:
            result = await session.execute(select(Account).filter_by(userid=id))
            user = result.scalar_one_or_none()
            if user:
                user.correct += 1
                nowtime = f"{datetime.datetime.now().year}/{datetime.datetime.now().month}/{datetime.datetime.now().day}"
                correctdata = json.loads(user.correctdata) if user.correctdata else {}
                baddata = json.loads(user.baddata) if user.baddata else {}
                correctdata[nowtime] = correctdata.get(nowtime, 0) + 1
                if nowtime not in baddata:
                    baddata[nowtime] = 0
                user.correctdata = json.dumps(correctdata)
                user.baddata = json.dumps(baddata)
                await session.commit()

    @staticmethod
    async def add_bad(id: str):
        async with async_session() as session:
            result = await session.execute(select(Account).filter_by(userid=id))
            user = result.scalar_one_or_none()
            if user:
                user.bad += 1
                nowtime = f"{datetime.datetime.now().year}/{datetime.datetime.now().month}/{datetime.datetime.now().day}"
                correctdata = json.loads(user.correctdata) if user.correctdata else {}
                baddata = json.loads(user.baddata) if user.baddata else {}
                if nowtime not in correctdata:
                    correctdata[nowtime] = 0
                baddata[nowtime] = baddata.get(nowtime, 0) + 1
                user.correctdata = json.dumps(correctdata)
                user.baddata = json.dumps(baddata)
                await session.commit()

    @staticmethod
    async def get_bad(id: str):
        async with async_session() as session:
            result = await session.execute(select(Account).filter_by(userid=id))
            user = result.scalar_one_or_none()
            return user.bad if user else None

    @staticmethod
    async def get_all(id: str):
        async with async_session() as session:
            result = await session.execute(select(Account).filter_by(userid=id))
            user = result.scalar_one_or_none()
            if user:
                return {
                    "correct": json.loads(user.correctdata) if user.correctdata else {},
                    "bad": json.loads(user.baddata) if user.baddata else {}
                }
            return None

    @staticmethod
    async def get(id: str):
        async with async_session() as session:
            result = await session.execute(select(Account).filter_by(userid=id))
            user = result.scalar_one_or_none()
            if user:
                return {"correct": user.correct, "bad": user.bad}
            return None

    @staticmethod
    async def get_mondai(name: str):
        async with async_session() as session:
            result = await session.execute(select(Mondai).filter_by(name=name))
            mondai = result.scalar_one_or_none()
            if mondai:
                return json.loads(mondai.mondai)
            return None

    @staticmethod
    async def get_mondai_userids(name: str):
        async with async_session() as session:
            result = await session.execute(select(Mondai).filter_by(name=name))
            mondai_list = result.scalars().all()
            if not mondai_list:
                return None
            return [m.userid for m in mondai_list]

    @staticmethod
    async def save_mondai(name: str, userid: str, mondai_data):
        async with async_session() as session:
            new_mondai = Mondai(
                name=name,
                userid=userid,
                mondai=json.dumps(mondai_data)
            )
            session.add(new_mondai)
            await session.commit()

    @staticmethod
    async def edit_mondai(name: str, userid: str, mondai_data):
        async with async_session() as session:
            result = await session.execute(select(Mondai).filter_by(name=name, userid=userid))
            mondai = result.scalar_one_or_none()
            if mondai:
                mondai.mondai = json.dumps(mondai_data)
                await session.commit()
                return True
            else:
                return False

class Data(BaseModel):
    id: str
    password: str

# サイト
@app.get("/")
async def root(request: Request):
    userid = request.cookies.get("id")
    
    if userid:
        try:
            usermondai = await DB.get_mondai_userids(userid)
        except:
            usermondai = []

        if usermondai:
            html = """
            <div class="category" data-category="other">
                <p>作成した問題</p>
            """
            for mondai in usermondai:
                html += f"<a href='/mondai/{mondai}'>{mondai}</a>"

            html += "</div>"
        else:
            html = ""

        return templates.TemplateResponse("main.html", {"request": request, "html": html})

    return templates.TemplateResponse("main.html", {"request": request})


# APIエンドポイント
@app.post("/api/registration")
async def registration(data: Data):
    await DB.registration(data.id, data.password)
    return {"message": "registration successful"}

@app.post("/api/get_correct")
async def get_correct(data: Data):
    if await DB.password(data.id) != data.password:
        return {"message": "password is wrong"}
    correct = await DB.get_correct(data.id)
    return {"correct": correct}

@app.post("/api/add_correct")
async def add_correct(data: Data):
    if await DB.password(data.id) != data.password:
        return {"message": "password is wrong"}
    await DB.add_correct(data.id)
    return {"message": "add_correct successful"}

@app.post("/api/add_bad")
async def add_bad(data: Data):
    if await DB.password(data.id) != data.password:
        return {"message": "password is wrong"}
    await DB.add_bad(data.id)
    return {"message": "add_bad successful"}

@app.post("/api/get_bad")
async def get_bad(data: Data):
    if await DB.password(data.id) != data.password:
        return {"message": "password is wrong"}
    bad = await DB.get_bad(data.id)
    return {"bad": bad}

@app.post("/api/get")
async def get_user(data: Data):
    if await DB.password(data.id) != data.password:
        return {"message": "password is wrong"}
    return await DB.get(data.id)

@app.get("/api/get/{id}/{password}")
async def get_all(id: str, password: str):
    if await DB.password(id) != password:
        return {"message": "password is wrong"}
    return await DB.get_all(id)

@app.get("/api/ranking")
async def ranking():
    async with async_session() as session:
        result = await session.execute(select(Account).order_by(Account.correct.desc()).limit(5))
        users = result.scalars().all()
    ranking_list = [
        {"userid": user.userid, "correct": user.correct, "bad": user.bad}
        for user in users if user.correct != 0
    ]
    return ranking_list

@app.post("/api/change/name/{newname}")
async def change_name(data: Data, newname: str):
    if await DB.password(data.id) != data.password:
        return {"message": "password is wrong"}
    async with async_session() as session:
        result = await session.execute(select(Account).filter_by(userid=data.id))
        user = result.scalar_one_or_none()
        if user:
            user.userid = newname
            await session.commit()
            return {"message": "change name successful"}
    return {"message": "user not found"}

@app.post("/api/change/password/{newpassword}")
async def change_password(data: Data, newpassword: str):
    if await DB.password(data.id) != data.password:
        return {"message": "password is wrong"}
    async with async_session() as session:
        result = await session.execute(select(Account).filter_by(userid=data.id))
        user = result.scalar_one_or_none()
        if user:
            user.password = newpassword
            await session.commit()
            return {"message": "change password successful"}
    return {"message": "user not found"}

class MondaiData(BaseModel):
    name: str
    userid: str
    password: str
    mondai: List[str]

@app.post("/api/make/mondai")
async def make_mondai(data: MondaiData):
    if await DB.password(data.userid) != data.password:
        return {"message": "password is wrong"}
    await DB.save_mondai(data.name, data.userid, data.mondai)
    return {"status": "success"}

@app.post("/api/upload/image")
async def upload_image(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400, detail="File is not an image."
        )

    try:
        # Read the file contents
        contents = await file.read()

        # Validate as a picture
        try:
            img = Image.open(io.BytesIO(contents))
            img.verify()
        except Exception as e:
            raise HTTPException(status_code=400, detail="Invalid image format or corrupted image.")
        
        return JSONResponse(
            content={"filename": file.filename, "message": "Image uploaded successfully."},
            status_code=200
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"There was an error uploading the file: {str(e)}"
        )
    finally:
        await file.close()

@app.post("/api/upload/image")
async def upload_image(file: UploadFile = File(...)):

    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File is not an image.")
    
    try:
        contents = await file.read()

        try:
            img = Image.open(io.BytesIO(contents))
            img.verify()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid image format or corrupted image.")
        
        hash_value = xxhash.xxh64(contents).hexdigest()
        
        extension = file.filename.split(".")[-1] if "." in file.filename else "img"
        new_filename = f"{hash_value}.{extension}"

        with open(f"./upload/img/{new_filename}", "wb") as f:
            f.write(contents)
        
        return JSONResponse(
            content={
                "status": "success",
                "id": hash_value,
            },
            status_code=200
        )
    except Exception as e:
        raise HTTPException(
            content={
                "status": "failed",
                "message": f"There was an error uploading the file: {str(e)}"
            },
            status_code=500
        )
    finally:
        await file.close()

class ImageData(BaseModel):
    id: str

@app.post("/api/process/image")
async def process_image(data: ImageData):
    image_path = f"./upload/img/{data.id}"
    if not os.path.exists(image_path):
        raise HTTPException(
            content={"status": "failed", "message": "Image not found"},
            status_code=404
        )

    image = Image.open(image_path)

    try:
        model = genai.GenerativeModel("gemini-2.0-flash")

        prompt = "この画像について2,3文で簡単に説明して。"

        response = model.generate_content([prompt, image])

        return JSONResponse(
            content={"status": "success", "data":response.text },
            status_code=200
        )
    except Exception as e:
        raise HTTPException(
            content={"status": "failed", "message": f"Error processing image: {str(e)}"},
            status_code=500
        )

@app.post("/api/edit/mondai")
async def edit_mondai(data: MondaiData):
    if await DB.password(data.userid) != data.password:
        return {"message": "password is wrong"}
    
    status = await DB.edit_mondai(data.name, data.userid, data.mondai)

    if status:
        return {"status": "success"}
    else:
        return {"status": "failed"}

@app.get("/api/get/mondai/{name}")
async def get_mondai(name: str):
    mondai = await DB.get_mondai(name)
    if not mondai:
        return {"message": "not found"}
    return mondai

@app.get("/api/get/mondai/userids/{name}")
async def get_mondai_userids(name: str):
    mondai = await DB.get_mondai_userids(name)
    if not mondai:
        return {"message": "not found"}
    return mondai

@app.get("/api/mosi/get")
async def mosiget():
    async with aiofiles.open('./app/itpasu/play/mondai/management.json', mode='r') as f:
        management_data = json.loads(await f.read())
    async with aiofiles.open('./app/itpasu/play/mondai/strategy.json', mode='r') as f:
        strategy_data = json.loads(await f.read())
    async with aiofiles.open('./app/itpasu/play/mondai/technology.json', mode='r') as f:
        technology_data = json.loads(await f.read())

    management_mondai = random.sample(management_data, min(20, len(management_data)))
    strategy_mondai = random.sample(strategy_data, min(35, len(strategy_data)))
    technology_mondai = random.sample(technology_data, min(45, len(technology_data)))

    combined_mondai = management_mondai + strategy_mondai + technology_mondai

    return combined_mondai

app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=8080)