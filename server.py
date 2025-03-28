import datetime
import io
import json
import os
import random
from contextlib import asynccontextmanager
from typing import List, Union

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from PIL import Image
import aiofiles
import xxhash
import numpy as np
import google.generativeai as genai
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
    name = Column(String, primary_key=True)
    userid = Column(String)
    mondai = Column(String)
    is_public = Column(Integer, default=1)  # 1=公開、0=非公開
    created_at = Column(String, default=lambda: datetime.datetime.now().isoformat())
    updated_at = Column(String, default=lambda: datetime.datetime.now().isoformat())

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

                # 日付がなければ初期化
                if nowtime not in correctdata or not isinstance(correctdata[nowtime], dict):
                    correctdata[nowtime] = {}
                if nowtime not in baddata or not isinstance(baddata[nowtime], dict):
                    baddata[nowtime] = {}

                # 科目別のカウントを更新
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
    async def get_mondai(name: str):
        async with async_session() as session:
            result = await session.execute(select(Mondai).filter_by(name=name))
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
                # 現在の状態を逆にする (1→0, 0→1)
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
                html += f"<a href='/play/?userid={userid}&name={mondai}'>{mondai}</a>"

            html += "</div>"
        else:
            html = ""

        return templates.TemplateResponse("main.html", {"request": request, "html": html})

    return templates.TemplateResponse("main.html", {"request": request})

@app.get("/play/")
async def play(request: Request):
    return templates.TemplateResponse("play.html", {"request": request})

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
    await DB.add_correct(data.id, data.subject)
    return {"message": "add_correct successful"}

@app.post("/api/add_bad")
async def add_bad(data: AnswerData):
    if await DB.password(data.id) != data.password:
        return {"message": "password is wrong"}
    await DB.add_bad(data.id, data.subject)
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

@app.post("/api/process/text")
async def process_text(data: TextData):
    try:
        model = genai.GenerativeModel("gemini-2.0-flash")
        
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
                    response = model.generate_content(prompt)
                    results.append({
                        "feedback": response.text,
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
            response = model.generate_content(prompt)
            results.append({"feedback": response.text, "index": 0, "status": "success"})
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
async def get_problem_stats(data: MondaiIdData):
    """
    問題の使用統計を取得するAPI
    """
    if await DB.password(data.userid) != data.password:
        return {"message": "password is wrong"}
    
    # 現在はダミーデータを返す
    # 実際の統計データはユーザーの回答履歴などから計算する必要がある
    return {
        "status": "success",
        "stats": {
            "usage_count": random.randint(10, 100),
            "correct_count": random.randint(5, 50),
            "incorrect_count": random.randint(5, 50)
        }
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

async def fetch_wikipedia_info(word: str):
    """
    Wikipediaから指定された単語の情報を取得する非同期関数
    """
    try:
        # Wikipedia APIを使用して情報を取得
        url = f"https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch={word}&format=json"
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                data = await response.json()
                if "query" in data and "search" in data["query"] and len(data["query"]["search"]) > 0:
                    return data["query"]["search"][0]["snippet"]
                else:
                    return None
    except Exception as e:
        print(f"Error fetching Wikipedia info: {e}")
        return None

class wordData(BaseModel):
    word: str
    mondai: str
    mondainame: str

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

        wiki_response = await fetch_wikipedia_info(word)
        if wiki_response:
            return {
                "word": word,
                "definition": wiki_response,
                "success": True
            }
        else:
            model = genai.GenerativeModel("gemini-2.0-flash-lite")
            prompt = f"以下の単語の意味を説明してください：\n{word}"
            response = model.generate_content(prompt)
            return {
                "word": word,
                "definition": response.text,
                "success": True
            }
        
    except Exception as e:
        return {
            "word": word,
            "definition": "定義を取得できませんでした。",
            "success": False,
            "error": str(e)
        }

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

    prompt = """
        #目的
        学習アドバイザーの専門家として、
        まず、以下の学習データを分析して
        今後の具体的な学習方法などについてアドバイスをしてください。

        #出力条件
        140字から180字程度

        #前提データ
        今日は2025年3月19日です。

        #学習データ
        直近の学習動向(10日以内)
        3月11日 総取り組み数 43 正解数 21 不正解数 22
        3月13日 総取り組み数 60正解数 25不正解数 35
        3月15日 総取り組み数 40正解数 30不正解数 10
        3月16日 総取り組み数 50正解数 25不正解数 25
        学習カテゴリ(10日以内)
        ITパスポート 97問
        ビジネス 1級 48問
        ビジネス 2級 46問
    """

    try:
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content([prompt])
        advice = response.text
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating advice: {str(e)}")

app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=8080)
