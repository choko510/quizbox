import datetime
import io
import json
import os
import random
import re
from contextlib import asynccontextmanager
from typing import List, Union
import base64

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Request, UploadFile,Response
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from PIL import Image
import aiofiles
import xxhash
import numpy as np
import google.generativeai as genai
from gtts import gTTS
from io import BytesIO
import aiohttp

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
    progress_data = Column(String, default="{}")  # 学習進捗データを保存するカラム

class Mondai(Base):
    __tablename__ = 'mondai'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String)  # 問題名（外部キー制約は今回は省略）
    userid = Column(String)
    mondai = Column(String)
    is_public = Column(Integer, default=1)  # 1=公開、0=非公開
    created_at = Column(String, default=lambda: datetime.datetime.now().isoformat())
    updated_at = Column(String, default=lambda: datetime.datetime.now().isoformat())

class MondaiStats(Base):
    """問題の統計情報を保存するテーブル"""
    __tablename__ = 'mondai_stats'
    id = Column(Integer, primary_key=True, autoincrement=True)
    mondai_name = Column(String, index=True, unique=True)  # 問題名（外部キー制約は今回は省略）
    usage_count = Column(Integer, default=0)  # 総利用回数
    correct_count = Column(Integer, default=0)  # 正解回数
    incorrect_count = Column(Integer, default=0)  # 不正解回数
    last_updated = Column(String, default=lambda: datetime.datetime.now().isoformat())
    

templates = Jinja2Templates(directory="templates")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # アプリ起動時の処理（startup）
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(lifespan=lifespan)

class DB:
    @staticmethod
    async def _update_data(user, subject: str, is_correct: bool):
        nowtime = f"{datetime.datetime.now().year}/{datetime.datetime.now().month}/{datetime.datetime.now().day}"
        def safe_load(data):
            try:
                d = json.loads(data) if data else {}
            except json.JSONDecodeError:
                d = {}
            return d if isinstance(d, dict) else {}
        correctdata = safe_load(user.correctdata)
        baddata = safe_load(user.baddata)
        if nowtime not in correctdata:
            correctdata[nowtime] = {}
        if nowtime not in baddata:
            baddata[nowtime] = {}
        subject_key = subject if subject else 'other'
        if is_correct:
            user.correct += 1
            correctdata[nowtime][subject_key] = correctdata[nowtime].get(subject_key, 0) + 1
        else:
            user.bad += 1
            baddata[nowtime][subject_key] = baddata[nowtime].get(subject_key, 0) + 1
        user.correctdata = json.dumps(correctdata)
        user.baddata = json.dumps(baddata)
    
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
    async def add_correct(id: str, subject: str = None):
        async with async_session() as session:
            result = await session.execute(select(Account).filter_by(userid=id))
            user = result.scalar_one_or_none()
            if user:
                user.correct += 1
                nowtime = f"{datetime.datetime.now().year}/{datetime.datetime.now().month}/{datetime.datetime.now().day}"
                try:
                    correctdata = json.loads(user.correctdata) if user.correctdata else {}
                    if not isinstance(correctdata, dict):
                        correctdata = {}
                except json.JSONDecodeError:
                    correctdata = {}

                try:
                    baddata = json.loads(user.baddata) if user.baddata else {}
                    if not isinstance(baddata, dict):
                        baddata = {}
                except json.JSONDecodeError:
                    baddata = {}

                # 日付がなければ初期化
                if nowtime not in correctdata or not isinstance(correctdata[nowtime], dict):
                    correctdata[nowtime] = {}
                if nowtime not in baddata or not isinstance(baddata[nowtime], dict):
                    baddata[nowtime] = {}

                # 科目別のカウントを更新
                subject_key = subject if subject else 'other'
                if subject_key not in correctdata[nowtime]:
                    correctdata[nowtime][subject_key] = 0
                correctdata[nowtime][subject_key] += 1

                user.correctdata = json.dumps(correctdata)
                user.baddata = json.dumps(baddata)
                await session.commit()
                
                # 問題の統計データも更新
                if subject:
                    await DB.update_mondai_stats(subject, True)

    @staticmethod
    async def add_bad(id: str, subject: str = None):
        async with async_session() as session:
            result = await session.execute(select(Account).filter_by(userid=id))
            user = result.scalar_one_or_none()
            if user:
                user.bad += 1
                nowtime = f"{datetime.datetime.now().year}/{datetime.datetime.now().month}/{datetime.datetime.now().day}"
                try:
                    correctdata = json.loads(user.correctdata) if user.correctdata else {}
                    if not isinstance(correctdata, dict):
                        correctdata = {}
                except json.JSONDecodeError:
                    correctdata = {}

                try:
                    baddata = json.loads(user.baddata) if user.baddata else {}
                    if not isinstance(baddata, dict):
                        baddata = {}
                except json.JSONDecodeError:
                    baddata = {}

                if nowtime not in correctdata or not isinstance(correctdata[nowtime], dict):
                    correctdata[nowtime] = {}
                if nowtime not in baddata or not isinstance(baddata[nowtime], dict):
                    baddata[nowtime] = {}

                subject_key = subject if subject else 'other'
                if subject_key not in baddata[nowtime]:
                    baddata[nowtime][subject_key] = 0
                baddata[nowtime][subject_key] += 1

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
    async def get_all_answers(id: str):
        """
        ユーザーの全解答履歴を取得する
        戻り値: List[Dict] 形式で、各要素は {"subject": "科目名", "result": bool} の形式
        """
        async with async_session() as session:
            result = await session.execute(select(Account).filter_by(userid=id))
            user = result.scalar_one_or_none()
            if not user:
                return []

            try:
                # 正解と不正解のデータを取得と検証
                correct_data = json.loads(user.correctdata) if user.correctdata else {}
                if not isinstance(correct_data, dict):
                    correct_data = {}

                bad_data = json.loads(user.baddata) if user.baddata else {}
                if not isinstance(bad_data, dict):
                    bad_data = {}

                # 全ての日付のデータを集計
                all_answers = []
                
                # 正解データの処理
                for date, subjects in correct_data.items():
                    if isinstance(subjects, dict):
                        for subject, count in subjects.items():
                            if isinstance(count, int) and count > 0:
                                all_answers.extend([{"subject": subject, "result": True}] * count)
                
                # 不正解データの処理
                for date, subjects in bad_data.items():
                    if isinstance(subjects, dict):
                        for subject, count in subjects.items():
                            if isinstance(count, int) and count > 0:
                                all_answers.extend([{"subject": subject, "result": False}] * count)

            except (json.JSONDecodeError, AttributeError, TypeError) as e:
                print(f"Error processing user data: {e}")
                return []

            return all_answers

    @staticmethod
    async def get(id: str):
        async with async_session() as session:
            result = await session.execute(select(Account).filter_by(userid=id))
            user = result.scalar_one_or_none()
            if user:
                return {"correct": user.correct, "bad": user.bad}
            return None

    @staticmethod
    async def get_mondai(userid:str,name: str):
        async with async_session() as session:
            result = await session.execute(select(Mondai).filter_by(userid=userid, name=name))
            mondai = result.scalar_one_or_none()
            if mondai:
                return json.loads(mondai.mondai)
            return None

    @staticmethod
    async def get_mondai_userids(userid: str):
        async with async_session() as session:
            result = await session.execute(select(Mondai).filter_by(userid=userid))
            mondai_list = result.scalars().all()
            if not mondai_list:
                return None
            return [m.name for m in mondai_list]
            
    @staticmethod
    async def get_mondai_details(userid: str):
        """
        ユーザーの作成した問題の詳細情報を取得する
        """
        async with async_session() as session:
            result = await session.execute(select(Mondai).filter_by(userid=userid))
            mondai_list = result.scalars().all()
            if not mondai_list:
                return []
                
            detail_list = []
            for m in mondai_list:
                try:
                    mondai_data = json.loads(m.mondai) if m.mondai else []
                    detail_list.append({
                        "name": m.name,
                        "data": mondai_data,
                        "is_public": bool(m.is_public),
                        "problemCount": len(mondai_data),
                        "created_at": m.created_at,
                        "updated_at": m.updated_at
                    })
                except (json.JSONDecodeError, Exception) as e:
                    print(f"Error parsing mondai data for {m.name}: {e}")
                    # エラーがあっても続行
                    pass
                    
            return detail_list

    @staticmethod
    async def save_mondai(name: str, userid: str, mondai_data, is_public: bool = True):
        async with async_session() as session:
            new_mondai = Mondai(
                name=name,
                userid=userid,
                mondai=json.dumps(mondai_data),
                is_public=1 if is_public else 0,
                created_at=datetime.datetime.now().isoformat(),
                updated_at=datetime.datetime.now().isoformat()
            )
            session.add(new_mondai)
            await session.commit()

    @staticmethod
    async def edit_mondai(name: str, userid: str, mondai_data, is_public: bool = None):
        async with async_session() as session:
            result = await session.execute(select(Mondai).filter_by(name=name, userid=userid))
            mondai = result.scalar_one_or_none()
            if mondai:
                mondai.mondai = json.dumps(mondai_data)
                mondai.updated_at = datetime.datetime.now().isoformat()
                # 公開状態も更新する場合
                if is_public is not None:
                    mondai.is_public = 1 if is_public else 0
                await session.commit()
                return True
            else:
                return False
    
    @staticmethod
    async def toggle_mondai_visibility(name: str, userid: str):
        """
        問題の公開状態を切り替える
        """
        async with async_session() as session:
            result = await session.execute(select(Mondai).filter_by(name=name, userid=userid))
            mondai = result.scalar_one_or_none()
            if mondai:
                mondai.is_public = 1 if mondai.is_public == 0 else 0
                mondai.updated_at = datetime.datetime.now().isoformat()
                await session.commit()
                return {"is_public": bool(mondai.is_public)}
            else:
                return None
    
    @staticmethod
    async def delete_mondai(name: str, userid: str):
        """
        問題を削除する
        """
        async with async_session() as session:
            result = await session.execute(select(Mondai).filter_by(name=name, userid=userid))
            mondai = result.scalar_one_or_none()
            if mondai:
                await session.delete(mondai)
                await session.commit()
                return True
            else:
                return False
                
    @staticmethod
    async def save_progress_data(id: str, progress_data: dict, problem_set: str):
        """
        ユーザーの学習進捗データを保存する（問題セットごと）
        """
        async with async_session() as session:
            result = await session.execute(select(Account).filter_by(userid=id))
            user = result.scalar_one_or_none()
            if user:
                try:
                    # 既存のデータを取得
                    all_progress_data = json.loads(user.progress_data) if user.progress_data else {}
                except json.JSONDecodeError:
                    all_progress_data = {}
                
                # 問題セットごとのデータを更新
                if not isinstance(all_progress_data, dict):
                    all_progress_data = {}
                
                # 問題セットのデータを更新
                all_progress_data[problem_set] = progress_data
                
                # 更新したデータを保存
                user.progress_data = json.dumps(all_progress_data)
                await session.commit()
                return True
            return False
            
    @staticmethod
    async def get_progress_data(id: str, problem_set: str = None):
        """
        ユーザーの学習進捗データを取得する
        問題セットが指定された場合はその問題セットのデータのみを返す
        指定されない場合は全データを返す
        """
        async with async_session() as session:
            result = await session.execute(select(Account).filter_by(userid=id))
            user = result.scalar_one_or_none()
            if user:
                try:
                    all_progress_data = json.loads(user.progress_data) if user.progress_data else {}
                    if not isinstance(all_progress_data, dict):
                        all_progress_data = {}
                        
                    if problem_set:
                        # 特定の問題セットのデータを返す
                        return all_progress_data.get(problem_set, {})
                    else:
                        # 全データを返す
                        return all_progress_data
                except json.JSONDecodeError:
                    return {} if problem_set else {}
            return {}
    
    @staticmethod
    async def update_mondai_stats(mondai_name: str, is_correct: bool):
        """
        問題の統計情報を更新する
        統計データがなければ新規作成し、あれば更新する
        """
        async with async_session() as session:
            # 既存の統計データを検索
            result = await session.execute(
                select(MondaiStats).filter_by(mondai_name=mondai_name)
            )
            stats = result.scalar_one_or_none()
            
            if not stats:
                # 統計データがなければ新規作成
                stats = MondaiStats(
                    mondai_name=mondai_name,
                    usage_count=1,
                    correct_count=1 if is_correct else 0,
                    incorrect_count=0 if is_correct else 1,
                    last_updated=datetime.datetime.now().isoformat()
                )
                session.add(stats)
            else:
                # 既存データを更新
                stats.usage_count += 1
                if is_correct:
                    stats.correct_count += 1
                else:
                    stats.incorrect_count += 1
                stats.last_updated = datetime.datetime.now().isoformat()
            
            await session.commit()
            return True
            
    @staticmethod
    async def get_mondai_stats(mondai_name: str):
        """
        問題の統計情報を取得する
        """
        async with async_session() as session:
            result = await session.execute(
                select(MondaiStats).filter_by(mondai_name=mondai_name)
            )
            stats = result.scalar_one_or_none()
            
            if not stats:
                # 統計データがない場合はデフォルト値を返す
                return {
                    "usage_count": 0,
                    "correct_count": 0,
                    "incorrect_count": 0,
                    "last_updated": None
                }
            
            return {
                "usage_count": stats.usage_count,
                "correct_count": stats.correct_count,
                "incorrect_count": stats.incorrect_count,
                "last_updated": stats.last_updated
            }
    
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
                html += f'<a href="/play/?userid={userid}&name={mondai}">{mondai}</a>'

            html += "</div>"
        else:
            html = ""

        return templates.TemplateResponse("main.html", {"request": request, "html": html})

    return templates.TemplateResponse("main.html", {"request": request})

async def reqAI(pronpt, model="gemini-2.0-flash"):
    try:
        model = genai.GenerativeModel(model)
        response = await model.generate_content_async(pronpt)
        return response.text
    except Exception as geminierror:
        api_key = os.getenv("OPENROUTER_APIKEY")
        if not api_key or api_key == "":
            raise Exception(f"Primary AI request failed: {geminierror}. Additionally, OPENROUTER_APIKEY is not set.")
        
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
        }
        payload = {
            "model": "deepseek/deepseek-chat-v3-0324:free",
            "messages": [{"role": "user", "content": pronpt}],
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=payload) as response:
                    # Check if the response status is OK
                    if response.status != 200:
                        text = await response.text()
                        raise Exception(f"HTTP {response.status}: {text}")
                    try:
                        result = await response.json()
                    except Exception as json_error:
                        raise Exception(json_error)
                    return result["choices"][0]["message"]["content"]
        except Exception as e:
            raise Exception(e)

@app.get("/play/")
async def play(request: Request):
    return templates.TemplateResponse("play.html", {"request": request})

@app.get("/play")
async def play2(request: Request):
    return templates.TemplateResponse("play.html", {"request": request})

@app.get("/listening/")
async def listening(request: Request):
    return templates.TemplateResponse("listening.html", {"request": request})

@app.get("/listening")
async def listening2(request: Request):
    return templates.TemplateResponse("listening.html", {"request": request})

@app.get("/dashboard/")
async def dashboard(request: Request):
    userid = request.cookies.get("id")
    if not userid:
        return RedirectResponse(url="/", status_code=302)
    
    return templates.TemplateResponse("dashboard.html", {"request": request})

@app.get("/itpasu/play/")
async def itpasplay(request: Request):
    return templates.TemplateResponse("play.html", {"request": request})

@app.get("/itpasu/play/{path:path}")
async def redirect_to_itpasu(path: str):
    return RedirectResponse(url=f"/play/{path}", status_code=302)

@app.get("/itpasu/")
async def redirect_to_top():
    return RedirectResponse(url="/", status_code=302)

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

class AnswerData(BaseModel):
    id: str
    password: str
    subject: str = None

class ProgressData(BaseModel):
    id: str
    password: str
    progress_data: dict
    problem_set: str  # 問題セット名（mondai）を追加

@app.post("/api/add_correct")
async def add_correct(data: AnswerData):
    if await DB.password(data.id) != data.password:
        return {"message": "password is wrong"}
    
    # ユーザーの正解データを更新
    await DB.add_correct(data.id, data.subject)
    
    # 問題の統計データも更新（subjectが問題名と同じと仮定）
    if data.subject:
        await DB.update_mondai_stats(data.subject, True)
        
    return {"message": "add_correct successful"}

@app.post("/api/add_bad")
async def add_bad(data: AnswerData):
    if await DB.password(data.id) != data.password:
        return {"message": "password is wrong"}
    
    # ユーザーの不正解データを更新
    await DB.add_bad(data.id, data.subject)
    
    # 問題の統計データも更新（subjectが問題名と同じと仮定）
    if data.subject:
        await DB.update_mondai_stats(data.subject, False)
        
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

@app.post("/api/get/user")
async def get_all(data: Data):
    if await DB.password(data.id) != data.password:
        return {"message": "password is wrong"}
    return await DB.get_all(data.id)

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
    is_public: bool = True

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

class TextData(BaseModel):
    text: List[str]
    checkType: str = "quality"

class GenerateQuestionsData(BaseModel):
    text: str
    type: str = "mixed"
    count: int = 5

@app.post("/api/process/text")
async def process_text(data: TextData):
    try:
        results = []
        if data.checkType == "quality":
            # 最大10問まで処理する
            for i, problem_text in enumerate(data.text[:10]):
                if not problem_text.strip():  # 空のテキストをスキップ
                    continue
                    
                prompt = f"""
                    以下の問題と回答のペアを評価してください。特に以下の点に注意してください：
                    1. 質問の明確さ（曖昧さはないか）
                    2. 回答の正確性と適切さ
                    3. 誤字脱字や文法的な問題
                    4. 問題と回答のペアとしての整合性

                    評価結果を簡潔に記述してください。問題点があれば具体的な改善案も提示してください。
                    HTMLタグは使用せず、マークダウン形式で回答してください。
                    
                    以下問題:
                    {problem_text}
                """
                try:
                    response = await reqAI(prompt)
                    results.append({
                        "feedback": response,
                        "index": i,
                        "status": "success"
                    })
                except Exception as err:
                    # 個別の問題の処理エラーを記録するが、全体の処理は続行
                    results.append({
                        "feedback": f"この問題の処理中にエラーが発生しました。",
                        "index": i,
                        "status": "error",
                        "error": str(err)
                    })
        elif data.checkType == "summary":
            prompt = f"以下のテキストを要約してください：\n{' '.join(data.text)}"
            response = await reqAI(prompt)
            results.append({"feedback": response, "index": 0, "status": "success"})
        else:
            # 未知のcheckTypeに対する処理
            return JSONResponse(
                content={"status": "failed", "message": f"不明な処理タイプ: {data.checkType}"},
                status_code=400
            )

        return JSONResponse(
            content={"status": "success", "results": results},
            status_code=200
        )
    except Exception as e:
        print(f"Text processing error: {str(e)}")  # サーバーログにエラーを出力
        return JSONResponse(
            content={"status": "failed", "message": f"Error processing text: {str(e)}"},
            status_code=500
        )

@app.post("/api/process/image")
async def process_image(data: Union[ImageData, TextData]):
    # テキスト処理の場合
    if hasattr(data, 'text'):
        return await process_text(data)
    
    # 画像処理の場合
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

@app.get("/api/get/mondai/{userid}/{name}.json")
async def get_mondai(userid: str, name: str):
    mondai = await DB.get_mondai(userid, name)

    if not mondai:
        raise HTTPException(status_code=404, detail="Not found")
    
    results = []

    for mondai_data in mondai:
        word , description = mondai_data.split(",", 1)
        mondai_data = {
            "word": word.strip(),
            "description": description.strip()
        }
        results.append(mondai_data)

    return results

@app.get("/api/get/mondai/userids/{name}")
async def get_mondai_userids(name: str):
    mondai = await DB.get_mondai_userids(name)
    if not mondai:
        return {"message": "not found"}
    return mondai

@app.post("/api/dashboard/problems")
async def get_dashboard_problems(data: Data):
    """
    ダッシュボード用のユーザーの問題一覧詳細を取得するAPI
    """
    if await DB.password(data.id) != data.password:
        return {"message": "password is wrong"}
    
    problems = await DB.get_mondai_details(data.id)
    return {"problems": problems}

class MondaiIdData(BaseModel):
    name: str
    userid: str
    password: str

@app.post("/api/dashboard/toggle-visibility")
async def toggle_problem_visibility(data: MondaiIdData):
    """
    問題の公開/非公開状態を切り替えるAPI
    """
    if await DB.password(data.userid) != data.password:
        return {"message": "password is wrong"}
    
    result = await DB.toggle_mondai_visibility(data.name, data.userid)
    if result:
        return {"status": "success", "is_public": result["is_public"]}
    else:
        return {"status": "failed", "message": "Problem not found"}

@app.post("/api/dashboard/delete")
async def delete_problem(data: MondaiIdData):
    """
    問題を削除するAPI
    """
    if await DB.password(data.userid) != data.password:
        return {"message": "password is wrong"}
    
    success = await DB.delete_mondai(data.name, data.userid)
    if success:
        return {"status": "success"}
    else:
        return {"status": "failed", "message": "Problem not found"}

class DuplicateMondaiData(BaseModel):
    original_name: str
    new_name: str
    userid: str
    password: str

@app.post("/api/dashboard/duplicate")
async def duplicate_problem(data: DuplicateMondaiData):
    """
    問題を複製するAPI
    """
    if await DB.password(data.userid) != data.password:
        return {"message": "password is wrong"}
    
    # オリジナルの問題を取得
    mondai = await DB.get_mondai(data.original_name)
    if not mondai:
        return {"status": "failed", "message": "Original problem not found"}
    
    # 新しい名前で保存
    try:
        await DB.save_mondai(data.new_name, data.userid, mondai, True)
        return {"status": "success"}
    except Exception as e:
        print(f"Error duplicating problem: {e}")
        return {"status": "failed", "message": str(e)}

@app.post("/api/dashboard/stats")
async def get_problem_stats(data: MondaiIdData, request: Request):
    """
    問題の使用統計を取得するAPI
    """
    if await DB.password(data.userid) != data.password:
        return {"message": "password is wrong"}
    
    # 指定された問題の存在確認
    mondai_data = await DB.get_mondai(request.cookies.get("id"),data.name)
    if not mondai_data:
        return {"status": "failed", "message": "Problem not found"}
    
    # MondaiStats テーブルから統計情報を取得
    stats = await DB.get_mondai_stats(data.name)
    
    return {
        "status": "success",
        "stats": stats
    }

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

@app.post("/api/save_progress")
async def save_progress(data: ProgressData):
    """
    ユーザーの学習進捗データを保存するエンドポイント
    """
    if await DB.password(data.id) != data.password:
        return {"message": "password is wrong"}
    
    success = await DB.save_progress_data(data.id, data.progress_data, data.problem_set)
    if success:
        return {"message": "progress data saved successfully"}
    else:
        return {"message": "user not found"}

class GetProgressData(BaseModel):
    id: str
    password: str
    problem_set: str

@app.post("/api/get_progress")
async def get_progress(data: GetProgressData):
    """
    ユーザーの学習進捗データを取得するエンドポイント
    """
    if await DB.password(data.id) != data.password:
        return {"message": "password is wrong"}
    
    progress_data = await DB.get_progress_data(data.id, data.problem_set)
    return {"progress_data": progress_data}

@app.post("/api/get_all_progress")
async def get_all_progress(data: Data):
    """
    ユーザーの全ての問題セットの学習進捗データを取得するエンドポイント
    """
    if await DB.password(data.id) != data.password:
        return {"message": "password is wrong"}
    
    all_progress_data = await DB.get_progress_data(data.id)
    return {"all_progress_data": all_progress_data}

class wordData(BaseModel):
    word: str
    mondai: str

@app.post("/api/search/word/")
async def search_word(data: wordData):
    """
    辞書APIから単語の意味を取得するエンドポイント
    """

    word = data.word
    
    if not word:
        return {
            "word": word,
            "definition": "単語が指定されていません。",
            "success": False
        }
    
    try:
        prompt = f"""
        以下の単語「{word}」について詳しく説明してください。
        
        以下の情報を含めてください：
        1. 基本的な定義と意味
        2. 実際の使用例（例文を2-3つ）
        3. 関連する単語や類義語（あれば）
        4. 特定分野での専門的な意味（該当する場合）
        5. 「{data.mondai}」の文脈に関連した説明

        回答は簡潔かつ分かりやすい日本語で、100-200字程度でまとめてください。
        また、HTMLタグは使用せず、マークダウン形式で回答してください。
        """

        response = await reqAI(prompt,"gemini-2.0-flash-lite")
        return {
            "word": word,
            "definition": response,
            "success": True
        }
    except Exception as e:
        print(f"Error fetching definition: {e}")
        return {
            "word": word,
            "definition": "定義を取得できませんでした。",
            "success": False,
            "error": str(e)
        }

@app.get("/api/gen/speak/{word}")
async def gen_speak(word: str):
    # ファイルチェック
    filename = f"./data/audio/{xxhash.xxh64(word).hexdigest()}.mp3"

    if os.path.exists(filename):
        return FileResponse(filename)
    
    lang = "ja" if re.search(r'[--]', word) else "en"
    
    try:
        tts = gTTS(text=word, lang=lang, slow=True)
        
        audio_bytes = BytesIO()
        tts.write_to_fp(audio_bytes)
        audio_data = audio_bytes.getvalue()

        # ファイルに保存
        with open(filename, "wb") as f:
            f.write(audio_data)
        
        return Response(
            content=audio_data,
            media_type="audio/mpeg",
            headers={"Content-Disposition": f"attachment; filename={word}.mp3"}
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"音声生成に失敗しました: {str(e)}"
        )

@app.get("/api/listening/{word}")
async def listening_mode(word:str):
    """
    リスニングモードのエンドポイント
    """

    # 1. 単語から文章を生成
    prompt = f"""
    "{word}" という単語を使って、リスニング問題文を生成して下さい。
    中学生レベルの英語で比較的簡単な、文法的に正しい文章を作成してください。
    5単語から10単語程度の長さで、自然な文章を生成してください。
    出力形式は、リスニング用の問題文のみです。
    """
    sentence = await reqAI(prompt)

    try:
        tts = gTTS(text=sentence, lang="en", slow=True)
        
        audio_bytes = BytesIO()
        tts.write_to_fp(audio_bytes)
        audio_data = audio_bytes.getvalue()
        
        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
        return JSONResponse(
            content={
                "question": sentence,
                "audio": audio_base64,
            },
            status_code=200
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"音声生成に失敗しました: {str(e)}"
        )

@app.get("/api/get/category_stats/{id}/{password}")
async def get_category_stats(id: str, password: str):
    """
    ユーザーのカテゴリー別統計情報を取得するエンドポイント
    """
    if await DB.password(id) != password:
        return {"message": "password is wrong"}
    
    # カテゴリーごとのマッピング
    category_mapping = {
        "ITパスポート": ["it", "management", "strategy", "technology", "r04", "r05", "r06"],
        "プログラミング": ["prog", "proghard", "re"],
        "ビジネス": ["bizinesu", "hardbizinesu", "excelmondai"],
        "データベース": ["detabase"],
        "エクセル関数": ["excel2"],
        "その他": ["for", "mail"]
    }
    
    # カテゴリー別統計データを初期化
    category_stats = {}
    
    try:
        # ユーザーの全解答履歴を取得
        all_answers = await DB.get_all_answers(id)
        
        # カテゴリーごとに統計を集計
        for category_name, subject_list in category_mapping.items():
            correct_count = 0
            total_count = 0
            weak_areas = []
            
            # 各科目の正答数と総数を集計
            for subject in subject_list:
                subject_answers = [ans for ans in all_answers if ans["subject"] == subject]
                if not subject_answers:
                    continue
                
                # 科目ごとの正答率を計算
                subject_correct = sum(1 for ans in subject_answers if ans["result"])
                subject_total = len(subject_answers)
                subject_rate = (subject_correct / subject_total * 100) if subject_total > 0 else 0
                
                # 正答率が60%未満の科目を苦手分野として記録
                if subject_rate < 60 and subject_total >= 5:  # 最低5問以上解いている場合のみ
                    weak_areas.append(subject)
                
                correct_count += subject_correct
                total_count += subject_total
            
            # カテゴリーの統計情報を記録
            if total_count > 0:
                category_stats[category_name] = {
                    "correct": correct_count,
                    "total": total_count,
                    "weakAreas": weak_areas
                }
        
        return {"categories": category_stats}
        
    except Exception as e:
        print(f"Error in get_category_stats: {e}")
        return {"message": "internal server error"}

@app.post("/api/generate/questions")
async def generate_questions(data: GenerateQuestionsData):
    """
    テキストから問題と回答のペアを生成するエンドポイント
    """
    try:
        # 問題数と種類の制限をチェック
        count = min(max(data.count, 1), 10)  # 1-10問の間に制限
        
        # 問題タイプに応じたプロンプトを作成
        prompt = generate_question_prompt(data.text, data.type, count)
        
        # Geminiに問題生成をリクエスト
        response = await reqAI(prompt)
        
        # レスポンスをパースして問題と回答のペアを抽出
        questions = parse_gemini_response(response)
        
        return JSONResponse(
            content={"status": "success", "questions": questions},
            status_code=200
        )
    except Exception as e:
        print(f"Error generating questions: {str(e)}")
        return JSONResponse(
            content={"status": "failed", "message": f"Error: {str(e)}"},
            status_code=500
        )

def generate_question_prompt(text, type, count):
    """問題タイプに応じたプロンプトを生成する"""
    # 問題タイプに応じたプロンプトを返す
    base_prompt = f"""
    以下の文章から{count}個の問題と回答を作成してください。
    問題と回答は明確で、文章の内容に基づいたものにしてください。
    
    文章:
    {text}
    """
    
    type_prompts = {
        "basic": "基本的な質問と回答のペアを作成してください。",
        "multiple-choice": "4つの選択肢から選ぶ問題を作成してください。正解の選択肢を明示してください。",
        "true-false": "○×（真偽）の問題を作成してください。",
        "mixed": "様々なタイプの問題（基本問題、選択問題、○×問題）をバランス良く混ぜて作成してください。"
    }
    
    format_instruction = """
    以下の形式でJSONとして出力してください：
    [
        {
            "question": "問題文",
            "answer": "回答"
        },
        ...
    ]
    """
    
    return base_prompt + "\n" + type_prompts.get(type, type_prompts["mixed"]) + "\n" + format_instruction

def parse_gemini_response(response_text):
    """GeminiのレスポンスからJSON形式の問題データを抽出する"""
    try:
        # JSON部分を抽出（コードブロックの中身を取得）
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response_text)
        json_str = json_match.group(1) if json_match else response_text
        
        # 余分な空白やインデントを取り除く
        json_str = json_str.strip()
        
        questions = json.loads(json_str)
        
        # 形式の検証
        if not isinstance(questions, list):
            raise ValueError("Response is not a list")
            
        for q in questions:
            if not isinstance(q, dict) or "question" not in q or "answer" not in q:
                raise ValueError("Invalid question format")
        
        return questions
    except Exception as e:
        print(f"Error parsing response: {e}")
        # ダミーの質問を1つ返す（エラーケース）
        return [{"question": "エラー: 問題の生成に失敗しました", "answer": "エラーが発生しました"}]

@app.post("/api/get/advice")
async def get_advice(data: Data):
    """
    ユーザーに対してアドバイスを提供するエンドポイント
    """
    if await DB.password(data.id) != data.password:
        return {"message": "password is wrong"}
    
    # 学習データを取得
    all_answers = await DB.get_all_answers(data.id)
    if not all_answers:
        return {"advice": "アドバイスを生成するためのデータがありません"}
    
    # 現在の日付から30日前までの日付を計算
    today = datetime.datetime.now()
    thirty_days_ago = today - datetime.timedelta(days=30)
    today_str = today.strftime("%Y年%m月%d日")
    
    # 解答データから日付ごとの統計を集計
    # データベース構造に合わせて、正解・不正解データを取得
    user_data = await DB.get_all(data.id)
    if not user_data:
        return {"advice": "アドバイスを生成するためのデータがありません"}
    
    # 日付別の学習統計を取得
    correct_data = user_data.get("correct", {})
    bad_data = user_data.get("bad", {})
    
    # 直近30日間の日付を生成（YYYY/MM/DD形式）
    date_format = "%Y/%m/%d"
    recent_dates = []
    for i in range(30):
        date = today - datetime.timedelta(days=i)
        recent_dates.append(date.strftime(date_format))
    
    # 日付ごとの統計情報を構築
    daily_stats_lines = []
    study_dates = []  # 学習を行った日付
    
    for date_str in recent_dates:
        if date_str in correct_data or date_str in bad_data:
            # その日の正解数を集計
            correct_count = sum(count for subject, count in correct_data.get(date_str, {}).items())
            # その日の不正解数を集計
            bad_count = sum(count for subject, count in bad_data.get(date_str, {}).items())
            # 総取り組み数
            total_count = correct_count + bad_count
            
            if total_count > 0:
                study_dates.append(date_str)  # 学習日として記録
                # 日付をYYYY/MM/DD形式からMM月DD日形式に変換
                try:
                    date_obj = datetime.datetime.strptime(date_str, date_format)
                    formatted_date = date_obj.strftime("%m月%d日")
                    daily_stats_lines.append(f"{formatted_date} 総取り組み数 {total_count} 正解数 {correct_count} 不正解数 {bad_count}")
                except ValueError:
                    # 日付形式が異なる場合はそのまま使用
                    daily_stats_lines.append(f"{date_str} 総取り組み数 {total_count} 正解数 {correct_count} 不正解数 {bad_count}")
    
    # カテゴリ別の問題数と週ごとの正答率を集計
    category_counts = {}
    category_weekly_accuracy = {}
    
    # 直近30日間のデータからカテゴリを集計し、各週ごとの正答率も計算
    for i, date_str in enumerate(recent_dates):
        week_num = i // 7  # 0: 最新の週、1: 1週間前、2: 2週間前、3: 3週間前
        
        # その日のカテゴリごとの正解・不正解を集計
        for subject, correct_count in correct_data.get(date_str, {}).items():
            if subject not in category_counts:
                category_counts[subject] = 0
                category_weekly_accuracy[subject] = {0: [0, 0], 1: [0, 0], 2: [0, 0], 3: [0, 0]}  # [正解数, 合計問題数]
            
            category_counts[subject] += correct_count
            # 週ごとの正解数と総問題数を更新
            category_weekly_accuracy[subject][week_num][0] += correct_count
            category_weekly_accuracy[subject][week_num][1] += correct_count
        
        for subject, bad_count in bad_data.get(date_str, {}).items():
            if subject not in category_counts:
                category_counts[subject] = 0
                category_weekly_accuracy[subject] = {0: [0, 0], 1: [0, 0], 2: [0, 0], 3: [0, 0]}
            
            category_counts[subject] += bad_count
            # 週ごとの総問題数のみ更新（不正解なので正解数は更新しない）
            category_weekly_accuracy[subject][week_num][1] += bad_count
    
    # 学習の継続性を分析
    study_continuity = {
        "max_consecutive_days": 0,
        "current_streak": 0,
        "study_gaps": []
    }
    
    # 学習日を日付順にソート
    study_dates.sort()
    
    # 連続学習日数と中断期間を計算
    consecutive_days = 0
    last_date = None
    for date_str in study_dates:
        current_date = datetime.datetime.strptime(date_str, date_format)
        
        if last_date:
            # 前回の学習日との差を計算
            delta = (current_date - last_date).days
            
            if delta == 1:
                # 連続学習
                consecutive_days += 1
            else:
                # 学習の中断があった
                if delta > 2:  # 2日以上の中断を記録
                    study_continuity["study_gaps"].append(delta)
                
                # 連続記録をリセット
                consecutive_days = 1
        else:
            consecutive_days = 1
        
        # 最大連続学習日数を更新
        study_continuity["max_consecutive_days"] = max(study_continuity["max_consecutive_days"], consecutive_days)
        last_date = current_date
    
    # 現在の連続学習日数を設定
    if study_dates and (today - datetime.datetime.strptime(study_dates[-1], date_format)).days <= 1:
        study_continuity["current_streak"] = consecutive_days
    
    # 成長停滞分野を特定
    stagnant_categories = []
    for category, weekly_data in category_weekly_accuracy.items():
        # 最新の週と1週間前の週に十分なデータがある場合のみ分析
        if weekly_data[0][1] >= 5 and weekly_data[1][1] >= 5:
            # 各週の正答率を計算
            current_week_rate = (weekly_data[0][0] / weekly_data[0][1]) * 100 if weekly_data[0][1] > 0 else 0
            prev_week_rate = (weekly_data[1][0] / weekly_data[1][1]) * 100 if weekly_data[1][1] > 0 else 0
            
            # 正答率が改善していない場合は停滞分野として記録
            if current_week_rate <= prev_week_rate:
                stagnant_categories.append({
                    "name": category,
                    "current_rate": round(current_week_rate, 1),
                    "prev_rate": round(prev_week_rate, 1),
                    "change": round(current_week_rate - prev_week_rate, 1)
                })
    
    # 停滞分野を正答率の低い順にソート
    stagnant_categories.sort(key=lambda x: x["current_rate"])
    
    # カテゴリ統計行を生成
    category_stats_lines = []
    for category, count in category_counts.items():
        if count > 0:
            category_stats_lines.append(f"{category} {count}問")
    
    # 統計データがない場合は代替テキストを設定
    if not daily_stats_lines:
        daily_stats_text = "データがありません"
    else:
        daily_stats_text = "\n        ".join(daily_stats_lines[:10])  # 最新の10日分のデータのみ表示
    
    if not category_stats_lines:
        category_stats_text = "データがありません"
    else:
        category_stats_text = "\n        ".join(category_stats_lines)
    
    # 学習の継続性に関する情報をテキスト化
    continuity_text = ""
    if study_continuity["current_streak"] > 0:
        continuity_text += f"現在の連続学習日数: {study_continuity['current_streak']}日\n        "
    if study_continuity["max_consecutive_days"] > 0:
        continuity_text += f"最長連続学習日数: {study_continuity['max_consecutive_days']}日\n        "
    if study_continuity["study_gaps"]:
        avg_gap = sum(study_continuity["study_gaps"]) / len(study_continuity["study_gaps"])
        continuity_text += f"平均学習中断期間: {round(avg_gap, 1)}日\n        "
    
    # 停滞分野に関する情報をテキスト化
    stagnant_text = ""
    for i, cat in enumerate(stagnant_categories[:2]):  # 最大2つの停滞分野を表示
        if i == 0:
            stagnant_text += f"停滞が見られる分野: {cat['name']} (正答率: {cat['current_rate']}%, 前週比: {cat['change']}%)\n        "
        else:
            stagnant_text += f"他の停滞分野: {cat['name']} (正答率: {cat['current_rate']}%)\n        "

    # 学習傾向を分析するための追加データ
    total_answers = len(all_answers)
    correct_answers = sum(1 for ans in all_answers if ans["result"])
    if total_answers > 0:
        overall_accuracy = round((correct_answers / total_answers) * 100, 1)
    else:
        overall_accuracy = 0

    prompt = f"""
        #目的
        学習アドバイザーの専門家として、
        以下の学習データを分析して
        今後の具体的な学習方法などについてアドバイスをしてください。

        #出力条件
        280字から340字程度。
        文章は簡潔に、分かりやすく。

        #前提データ
        今日は{today_str}です。
        総解答数: {total_answers}問
        全体的な正答率: {overall_accuracy}%

        #学習継続性
        {continuity_text}
        
        #成長停滞分野
        {stagnant_text}

        #学習データ
        直近の学習動向(10日以内)
        {daily_stats_text}
        
        学習カテゴリ(30日以内)
        {category_stats_text}
    """

    try:
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = await model.generate_content_async([prompt])
        advice = response.text.replace("\n", "<br>") 
        
        return {"advice": advice}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating advice: {str(e)}")

app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="Run FastAPI server")
    parser.add_argument("--host", type=str, default="localhost", help="Server host (default: localhost)")
    parser.add_argument("--port", type=int, default=8080, help="Server port (default: 8080)")
    parser.add_argument("--log", type=str, choices=["critical", "error", "warning", "info", "debug", "trace"],
                        default="info", help="Logging level (default: info)")
    args = parser.parse_args()

    uvicorn.run(app, host=args.host, port=args.port, log_level=args.log)
