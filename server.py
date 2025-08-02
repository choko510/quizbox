from datetime import datetime, timedelta
import io
import json
import os
from pathlib import Path
import re
from contextlib import asynccontextmanager
from typing import List, Union, Dict, Any, Optional
import base64
import urllib.parse
import sys
import pickle

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Request, UploadFile, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from PIL import Image
import aiofiles
import xxhash
from google import genai
from google.genai import types
from google.genai.errors import APIError
from gtts import gTTS
from io import BytesIO
import aiohttp
import asyncio
import glob
import time

from sqlalchemy import Column, Integer, String, Float, func, desc
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.future import select as sa_select
from sqlalchemy.orm import declarative_base

# 辞書検索システム
class SearchDictionary:
    """辞書検索システム"""
    
    def __init__(self, json_file: str = "data/dictionary.json", cache_file: str = "dict_cache.pkl"):
        self.cache_file = cache_file
        self.word_cache = {}
        self.frequent_words_cache = {}
        self.load_optimized_dictionary(json_file)
        self.precompile_frequent_searches()
    
    def load_optimized_dictionary(self, json_file: str) -> None:
        """最適化された辞書読み込み"""
        if (os.path.exists(self.cache_file) and
            os.path.exists(json_file) and
            os.path.getmtime(self.cache_file) > os.path.getmtime(json_file)):
            try:
                with open(self.cache_file, 'rb') as f:
                    cache_data = pickle.load(f)
                    self.dictionary = cache_data['dictionary']
                    self.word_list = cache_data['word_list']
                    self.rank_index = cache_data['rank_index']
                return
            except:
                pass
        
        # JSONから読み込み
        with open(json_file, 'r', encoding='utf-8') as f:
            raw_dict = json.load(f)
        
        # 辞書の最適化
        self.dictionary = {}
        self.word_list = []
        self.rank_index = {}
        
        for word, data in raw_dict.items():
            word_interned = sys.intern(word.lower())
            self.dictionary[word_interned] = {
                'ja': [sys.intern(meaning) for meaning in data.get('ja', [])],
                'rank': data.get('rank'),
                'pos': sys.intern(data.get('pos', '')) if data.get('pos') else '',
                'past_tense': sys.intern(data.get('past_tense', '')) if data.get('past_tense') else '',
                'past_participle': sys.intern(data.get('past_participle', '')) if data.get('past_participle') else ''
            }
            self.word_list.append(word_interned)
            
            if data.get('rank'):
                self.rank_index[data['rank']] = word_interned
        
        # キャッシュを保存
        cache_data = {
            'dictionary': self.dictionary,
            'word_list': self.word_list,
            'rank_index': self.rank_index
        }
        
        try:
            with open(self.cache_file, 'wb') as f:
                pickle.dump(cache_data, f, protocol=pickle.HIGHEST_PROTOCOL)
        except:
            pass
    
    def precompile_frequent_searches(self) -> None:
        """頻繁に検索される単語を事前キャッシュ"""
        frequent_words = []
        for rank in range(1, 1001):
            if rank in self.rank_index:
                frequent_words.append(self.rank_index[rank])
        
        for word in frequent_words[:100]:
            if word in self.dictionary:
                self.frequent_words_cache[word] = self.dictionary[word]
    
    def search_word(self, word: str) -> Optional[Dict]:
        """単語検索"""
        word_lower = sys.intern(word.lower())
        
        if word_lower in self.frequent_words_cache:
            return self.frequent_words_cache[word_lower]
        
        if word_lower in self.word_cache:
            return self.word_cache[word_lower]
        
        result = self.dictionary.get(word_lower)
        
        if len(self.word_cache) < 10000:
            self.word_cache[word_lower] = result
        
        return result

    def batch_search(self, words: List[str]) -> Dict[str, Optional[Dict]]:
        """一括検索"""
        results = {}
        normalized_words = [(word, sys.intern(word.lower())) for word in words]
        
        for original_word, word_lower in normalized_words:
            if word_lower in self.frequent_words_cache:
                results[original_word] = self.frequent_words_cache[word_lower]
            elif word_lower in self.word_cache:
                results[original_word] = self.word_cache[word_lower]
            else:
                result = self.dictionary.get(word_lower)
                results[original_word] = result
                
                if len(self.word_cache) < 10000:
                    self.word_cache[word_lower] = result
        
        return results

# グローバルな辞書インスタンス
fast_dict = None


load_dotenv()

if not os.getenv("GEMINI_APIKEY") or os.getenv("GEMINI_APIKEY") == "":
    if not os.path.exists(".env"):
        raise ValueError("Please create .env file")
    else:
        raise ValueError("Please set GEMINI_APIKEY in .env file")

# Google GenAI SDK 初期化
gemini_api_key = os.getenv("GEMINI_APIKEY")
if not gemini_api_key:
    if not os.path.exists(".env"):
        raise ValueError("Please create .env file")
    else:
        raise ValueError("Please set GEMINI_APIKEY in .env file")

# クライアントは環境変数からもキーを自動検出するが、明示で渡す
genai_client = genai.Client(api_key=gemini_api_key)

DATABASE_URL = "sqlite+aiosqlite:///data.db"
engine = create_async_engine(DATABASE_URL)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()

class Account(Base):
    __tablename__ = 'user'
    userid = Column(String, primary_key=True)
    password = Column(String)
    correct = Column(Integer)
    bad = Column(Integer)
    correctdata = Column(String)
    baddata = Column(String)
    progress_data = Column(String, default="{}")
    progress_details = Column(String, default="{}") 

class Mondai(Base):
    __tablename__ = 'mondai'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String)  # 問題名（外部キー制約は今回は省略）
    userid = Column(String)
    mondai = Column(String)
    is_public = Column(Integer, default=1)  # 1=公開、0=非公開
    created_at = Column(String, default=lambda: datetime.now().isoformat())
    updated_at = Column(String, default=lambda: datetime.now().isoformat())

class MondaiStats(Base):
    """問題の統計情報を保存するテーブル"""
    __tablename__ = 'mondai_stats'
    id = Column(Integer, primary_key=True, autoincrement=True)
    mondai_name = Column(String, index=True, unique=True)  # 問題名（外部キー制約は今回は省略）
    usage_count = Column(Integer, default=0)  # 総利用回数
    correct_count = Column(Integer, default=0)  # 正解回数
    incorrect_count = Column(Integer, default=0)  # 不正解回数
    last_updated = Column(String, default=lambda: datetime.now().isoformat())
    

templates = Jinja2Templates(directory="templates")

# バックグラウンドタスク用のフラグ
cleanup_task = None

async def cleanup_temp_images():
    """
    定期的にtempディレクトリ内の1時間以上古いimgファイルを削除する
    """
    while True:
        try:
            # tempディレクトリのパス
            temp_dir = "./data/upload/temp/img"
            
            # ディレクトリが存在しない場合は作成
            os.makedirs(temp_dir, exist_ok=True)
            
            # 現在時刻
            current_time = time.time()
            one_hour_ago = current_time - 3600  # 1時間 = 3600秒
            
            # tempディレクトリ内のすべてのファイルをチェック
            pattern = os.path.join(temp_dir, "*")
            for file_path in glob.glob(pattern):
                if os.path.isfile(file_path):
                    # ファイルの作成時刻を取得
                    file_creation_time = os.path.getctime(file_path)
                    
                    # 1時間以上古いファイルを削除
                    if file_creation_time < one_hour_ago:
                        try:
                            os.remove(file_path)
                            print(f"古いtempファイルを削除しました: {file_path}")
                        except Exception as e:
                            print(f"ファイル削除エラー: {file_path}, エラー: {e}")
            
        except Exception as e:
            print(f"tempファイルクリーンアップエラー: {e}")
        
        # 10分間待機してから再実行
        await asyncio.sleep(600)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global cleanup_task, fast_dict
    
    # アプリ起動時の処理（startup）
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # 高速辞書システムを初期化
    try:
        fast_dict = SearchDictionary()
        print(f"⚡ 辞書検索システムが初期化されました: {len(fast_dict.dictionary):,} 単語")
    except Exception as e:
        print(f"⚠️  辞書初期化に失敗しました: {e}")
        fast_dict = None
    
    # バックグラウンドタスクを開始
    cleanup_task = asyncio.create_task(cleanup_temp_images())
    print("tempファイルクリーンアップタスクを開始しました")
    
    yield
    
    # アプリ終了時の処理（shutdown）
    if cleanup_task:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            print("tempファイルクリーンアップタスクを停止しました")

app = FastAPI(lifespan=lifespan)

class DB:
    @staticmethod
    def get_today() -> str:
        """現在の日付を YYYY/MM/DD 形式で返す"""
        now = datetime.now()
        return f"{now.year}/{now.month}/{now.day}"
        
    @staticmethod
    def safe_load_json(data: Optional[str]) -> Dict[str, Any]:
        """JSON文字列を安全にロードする"""
        if not data:
            return {}
        try:
            d = json.loads(data)
            return d if isinstance(d, dict) else {}
        except json.JSONDecodeError:
            return {}
            
    @staticmethod
    async def _update_data(user, subject: Optional[str], is_correct: bool):
        """ユーザーの正解・不正解データを更新する共通処理"""
        nowtime = DB.get_today()
        correctdata = DB.safe_load_json(user.correctdata)  # type: ignore
        baddata = DB.safe_load_json(user.baddata)  # type: ignore
        
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
            
        user.correctdata = json.dumps(correctdata)  # type: ignore
        user.baddata = json.dumps(baddata)  # type: ignore
    
    @staticmethod
    async def password(id: str):
        async with async_session() as session:
            result = await session.execute(sa_select(Account).filter_by(userid=id))
            user: Optional[Account] = result.scalar_one_or_none()
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
            result = await session.execute(sa_select(Account).filter_by(userid=id))
            user: Optional[Account] = result.scalar_one_or_none()
            return user.correct if user else None

    @staticmethod
    async def add_correct(id: str, subject: Optional[str] = None):
        async with async_session() as session:
            result = await session.execute(sa_select(Account).filter_by(userid=id))
            user: Optional[Account] = result.scalar_one_or_none()
            if user:
                # _update_dataメソッドを使用して共通処理を実行
                await DB._update_data(user, subject, True)
                await session.commit()
                
                # 問題の統計データも更新
                if subject:
                    await DB.update_mondai_stats(subject, True)

    @staticmethod
    async def add_bad(id: str, subject: Optional[str] = None):
        async with async_session() as session:
            result = await session.execute(sa_select(Account).filter_by(userid=id))
            user: Optional[Account] = result.scalar_one_or_none()
            if user:
                # _update_dataメソッドを使用して共通処理を実行
                await DB._update_data(user, subject, False)
                await session.commit()
                
                # 問題の統計データも更新
                if subject:
                    await DB.update_mondai_stats(subject, False)
    @staticmethod
    async def get_bad(id: str):
        async with async_session() as session:
            result = await session.execute(sa_select(Account).filter_by(userid=id))
            user: Optional[Account] = result.scalar_one_or_none()
            return user.bad if user else None

    @staticmethod
    async def get_all(id: str):
        async with async_session() as session:
            result = await session.execute(sa_select(Account).filter_by(userid=id))
            user: Optional[Account] = result.scalar_one_or_none()
            if user:
                return {
                    "correct": DB.safe_load_json(user.correctdata),  # type: ignore
                    "bad": DB.safe_load_json(user.baddata)  # type: ignore
                }
            return None

    @staticmethod
    async def get_all_answers(id: str):
        """
        ユーザーの全解答履歴を取得する
        戻り値: List[Dict] 形式で、各要素は {"subject": "科目名", "result": bool} の形式
        """
        async with async_session() as session:
            result = await session.execute(sa_select(Account).filter_by(userid=id))
            user: Optional[Account] = result.scalar_one_or_none()
            if not user:
                return []

            try:
                # 正解と不正解のデータを取得と検証
                correct_data = DB.safe_load_json(user.correctdata) # type: ignore
                bad_data = DB.safe_load_json(user.baddata) # type: ignore

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
            result = await session.execute(sa_select(Account).filter_by(userid=id))
            user: Optional[Account] = result.scalar_one_or_none()
            if user:
                return {
                    "correct": user.correct,
                    "bad": user.bad,
                    "progress_data": DB.safe_load_json(user.progress_data)  # type: ignore
                }
            return None

    @staticmethod
    async def get_mondai(userid:str, name: str):
        async with async_session() as session:
            
            # 対象のレコード数を事前にカウント
            count_query = sa_select(func.count()).select_from(Mondai).filter_by(userid=userid, name=name)
            count_result = await session.execute(count_query)
            record_count = count_result.scalar_one()

            # 複数レコードに対応
            query = sa_select(Mondai).filter_by(userid=userid, name=name)
            if record_count > 1:
                # 複数ある場合は最初のレコードを使用
                query = query.limit(1)
            
            result = await session.execute(query)
            mondai: Optional[Mondai] = result.scalar_one_or_none()
            
            if mondai:
                return json.loads(mondai.mondai)  # type: ignore
            
            return None

    @staticmethod
    async def get_mondai_userids(userid: str):
        userid = urllib.parse.unquote(userid)
        async with async_session() as session:
            result = await session.execute(sa_select(Mondai).filter_by(userid=userid))
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
            result = await session.execute(sa_select(Mondai).filter_by(userid=userid))
            mondai_list = result.scalars().all()
            if not mondai_list:
                return []
                
            detail_list = []
            for m in mondai_list:
                try:
                    mondai_data = json.loads(m.mondai) if m.mondai else []  # type: ignore
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
    async def save_mondai(name: str, userid: str, mondai_data, is_public: bool = True, session: Optional[AsyncSession] = None):
        if session:
            s = session
        else:
            s = async_session()

        if not session: # 外部からセッションが渡されていない場合のみasync withを使用
            async with s as _s:
                return await DB._save_mondai_internal(name, userid, mondai_data, is_public, _s, commit=True)
        else:
            return await DB._save_mondai_internal(name, userid, mondai_data, is_public, s, commit=False)

    @staticmethod
    async def _save_mondai_internal(name: str, userid: str, mondai_data, is_public: bool, s: AsyncSession, commit: bool):
        new_mondai = Mondai(
            name=name,
            userid=userid,
            mondai=json.dumps(mondai_data),
            is_public=1 if is_public else 0,
            created_at=datetime.now().isoformat(),
            updated_at=datetime.now().isoformat()
        )
        s.add(new_mondai)
        if commit:
            await s.commit()

    @staticmethod
    async def edit_mondai(name: str, userid: str, mondai_data, is_public: Optional[bool] = None):
        async with async_session() as session:
            result = await session.execute(sa_select(Mondai).filter_by(name=name, userid=userid))
            mondai: Optional[Mondai] = result.scalar_one_or_none()
            if mondai:
                mondai.mondai = json.dumps(mondai_data)  # type: ignore
                mondai.updated_at = datetime.now().isoformat()  # type: ignore
                # 公開状態も更新する場合
                if is_public is not None:
                    mondai.is_public = 1 if is_public else 0  # type: ignore
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
            result = await session.execute(sa_select(Mondai).filter_by(name=name, userid=userid))
            mondai: Optional[Mondai] = result.scalar_one_or_none()
            if mondai:
                mondai.is_public = 1 if mondai.is_public == 0 else 0  # type: ignore
                mondai.updated_at = datetime.now().isoformat()  # type: ignore
                await session.commit()
                return {"is_public": bool(mondai.is_public)}  # type: ignore
            else:
                return None
    
    @staticmethod
    async def delete_mondai(name: str, userid: str, session: Optional[AsyncSession] = None):
        """
        問題を削除する
        """
        if session:
            s = session
        else:
            s = async_session()

        if not session: # 外部からセッションが渡されていない場合のみasync withを使用
            async with s as _s:
                return await DB._delete_mondai_internal(name, userid, _s, commit=True)
        else:
            return await DB._delete_mondai_internal(name, userid, s, commit=False)

    @staticmethod
    async def _delete_mondai_internal(name: str, userid: str, s: AsyncSession, commit: bool):
        # 対象のレコード数を事前にカウント
        count_query = sa_select(func.count()).select_from(Mondai).filter_by(name=name, userid=userid)
        count_result = await s.execute(count_query)
        record_count = count_result.scalar_one()
        
        # 複数レコードの場合でも全て取得
        result = await s.execute(sa_select(Mondai).filter_by(name=name, userid=userid))
        mondai_list = result.scalars().all()
        
        if mondai_list:
            # 全ての該当レコードを削除
            for mondai in mondai_list:
                await s.delete(mondai)
            if commit:
                await s.commit()
            return True
        else:
            return False

    @staticmethod
    async def get_progress_summary(id: str):
        """
        Generate per-set summary: learned, learning, unlearned, total.
        """
        async with async_session() as session:
            # load raw progress data
            result = await session.execute(sa_select(Account).filter_by(userid=id))
            user: Optional[Account] = result.scalar_one_or_none()
            raw = DB.safe_load_json(user.progress_data) if user else {}  # type: ignore
        summary = {}
        for ps, prog in raw.items():
            total = 0
            file_path = Path("static/deta") / f"{ps}.txt"
            if file_path.exists():
                async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
                    total = sum(1 for l in await f.readlines() if l.strip())
            else:
                async with async_session() as s2:
                    res = await s2.execute(sa_select(Mondai).filter_by(userid=id, name=ps))
                    m: Optional[Mondai] = res.scalar_one_or_none()
                    if m and m.mondai:  # type: ignore
                        total = len(json.loads(m.mondai))  # type: ignore
            learned = prog.get("learned", 0)
            learning = prog.get("learning", 0)
            unlearned = max(0, total - learned - learning)
            summary[ps] = {"learned": learned, "learning": learning, "unlearned": unlearned, "total": total}
        return summary

    @staticmethod
    async def save_progress_data(id: str, problem_set: str, summary: dict, details: dict):
        """
        ユーザーの学習進捗データ（サマリと詳細）を保存する（問題セットごと）
        """
        async with async_session() as session:
            result = await session.execute(sa_select(Account).filter_by(userid=id))
            user: Optional[Account] = result.scalar_one_or_none()
            if user:
                try:
                    # 既存のサマリデータを取得・更新
                    all_summary_data = DB.safe_load_json(user.progress_data)  # type: ignore
                    all_summary_data[problem_set] = summary
                    user.progress_data = json.dumps(all_summary_data)  # type: ignore

                    # 既存の詳細データを取得・更新
                    all_details_data = DB.safe_load_json(user.progress_details)  # type: ignore
                    all_details_data[problem_set] = details
                    user.progress_details = json.dumps(all_details_data)  # type: ignore

                    await session.commit()
                    return True
                except Exception as e:
                    print(f"Error saving progress data for user {id}, set {problem_set}: {e}")
                    await session.rollback() # ロールバックを追加
                    return False
            return False
            
    @staticmethod
    async def get_progress_data(id: str, problem_set: Optional[str] = None):
        """
        ユーザーの学習進捗 *詳細* データを取得する (progress_details カラムから)
        問題セットが指定された場合はその問題セットのデータのみを返す
        指定されない場合は全データを返す
        """
        async with async_session() as session:
            result = await session.execute(sa_select(Account).filter_by(userid=id))
            user: Optional[Account] = result.scalar_one_or_none()
            if user:
                try:
                    # Load from progress_details column
                    all_details_data = DB.safe_load_json(user.progress_details)  # type: ignore

                    if problem_set:
                        # Return details for the specific problem set
                        return all_details_data.get(problem_set, {})
                    else:
                        # Return all details data
                        return all_details_data
                except json.JSONDecodeError:
                    print(f"Error decoding progress_details for user {id}")
                    return {} # Return empty dict on error, whether specific set or all
            return {} # Return empty dict if user not found
            
    @staticmethod
    async def update_mondai_stats(mondai_name: str, is_correct: bool):
        """
        問題の統計情報を更新する
        統計データがなければ新規作成し、あれば更新する
        """
        async with async_session() as session:
            # 既存の統計データを検索
            result = await session.execute(
                sa_select(MondaiStats).filter_by(mondai_name=mondai_name)
            )
            stats: Optional[MondaiStats] = result.scalar_one_or_none()
            
            if not stats:
                # 統計データがなければ新規作成
                stats = MondaiStats(
                    mondai_name=mondai_name,
                    usage_count=1,
                    correct_count=1 if is_correct else 0,
                    incorrect_count=0 if is_correct else 1,
                    last_updated=datetime.now().isoformat()
                )
                session.add(stats)
            else:
                # 既存データを更新
                stats.usage_count += 1  # type: ignore
                if is_correct:
                    stats.correct_count += 1  # type: ignore
                else:
                    stats.incorrect_count += 1  # type: ignore
                stats.last_updated = datetime.now().isoformat()  # type: ignore
            
            await session.commit()
            return True
            
    @staticmethod
    async def get_mondai_stats(mondai_name: str):
        """
        問題の統計情報を取得する
        """
        async with async_session() as session:
            result = await session.execute(
                sa_select(MondaiStats).filter_by(mondai_name=mondai_name)
            )
            stats: Optional[MondaiStats] = result.scalar_one_or_none()
            
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
        usermondai = await DB.get_mondai_userids(userid)

        if usermondai:
            html = """
            <div class="category" data-category="other">
                <p>作成した問題</p>
            """

            makeuser = urllib.parse.unquote(userid)

            for mondai in usermondai:
                html += f'<a href="/play/?userid={makeuser}&name={mondai}">{mondai} <br>作成者:{makeuser}</a>'

            html += "</div>"
        else:
            html = ""

        return templates.TemplateResponse("main.html", {"request": request, "html": html})

    return templates.TemplateResponse("main.html", {"request": request})

async def reqAI(prompt: str, model: str = "gemini-2.5-flash", images=None, stream: bool = False) -> str:
    """
    Google GenAI SDK (google-genai) での統一的な生成関数
    - prompt: テキストプロンプト
    - model: 使用モデル（例: gemini-2.5-flash）
    - images: PIL.Image.Image または その配列/パス
    - stream: ストリーミング応答を使用するか
    """
    # contents 構築
    contents: list[Any] = []
    if prompt:
        contents.append(prompt)

    # 画像対応（PIL またはパス）
    if images:
        imgs = images if isinstance(images, list) else [images]
        for img in imgs:
            if isinstance(img, str) and os.path.exists(img):
                img = Image.open(img)
            if img:
                contents.append(img)

    try:
        if stream:
            # ストリーミング
            stream_resp = genai_client.models.generate_content_stream(
                model=model,
                contents=contents,
            )
            chunks = []
            for chunk in stream_resp:
                if getattr(chunk, "text", None):
                    chunks.append(chunk.text)
            return "".join(chunks).strip()
        else:
            resp = genai_client.models.generate_content(
                model=model,
                contents=contents,
            )
            return (resp.text or "").strip()
    except APIError as e:
        # 内部詳細はログへ。外部には一般化した文面のみ返す
        print(f"[reqAI] Gemini APIError: {e}")
        if images:
            raise HTTPException(status_code=502, detail="AI生成に失敗しました（画像入力）")
        # テキストのみはOpenRouterにフォールバック（動作は元コード踏襲）
        api_key = os.getenv("OPENROUTER_APIKEY")
        if not api_key:
            raise HTTPException(status_code=502, detail="AI生成に失敗しました（設定不備）")

        try:
            url = "https://openrouter.ai/api/v1/chat/completions"
            headers = {"Authorization": f"Bearer {api_key}"}
            payload = {
                "model": "deepseek/deepseek-chat-v3-0324:free",
                "messages": [{"role": "user", "content": prompt}],
            }
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=payload) as r:
                    if r.status != 200:
                        error_text = await r.text()
                        print(f"[reqAI] OpenRouter HTTP error {r.status}: {error_text}")
                        raise HTTPException(status_code=502, detail="AI生成に失敗しました（フォールバック）")
                    result = await r.json()
                    return result["choices"][0]["message"]["content"]
        except Exception as openrouter_error:
            print(f"[reqAI] OpenRouter fallback error: {openrouter_error}")
            raise HTTPException(status_code=502, detail="AI生成に失敗しました")

@app.get("/play/")
@app.get("/play")
async def play(request: Request):
    return templates.TemplateResponse("play.html", {"request": request})

@app.get("/select/")
@app.get("/select")
async def select(request: Request):
    return templates.TemplateResponse("select.html", {"request": request})

@app.get("/listening/")
@app.get("/listening")
async def listening(request: Request):
    return templates.TemplateResponse("listening.html", {"request": request})

@app.get("/flashcard/")
@app.get("/flashcard")
async def flashcards(request: Request):
    """
    単語帳モードのページを表示する
    """
    return templates.TemplateResponse("flashcard.html", {"request": request})

@app.get("/dashboard/")
@app.get("/dashboard")
async def dashboard(request: Request):
    userid = request.cookies.get("id")
    if not userid:
        return RedirectResponse(url="/", status_code=302)
    
    return templates.TemplateResponse("dashboard.html", {"request": request})

# APIエンドポイント
@app.post("/api/registration")
async def registration(data: Data):
    await DB.registration(data.id, data.password)
    return {"message": "registration successful"}

@app.post("/api/get_correct")
async def get_correct(data: Data):
    password = await DB.password(data.id)
    if password is None or password != data.password:  # type: ignore
        return {"message": "password is wrong or user not found"}
    correct = await DB.get_correct(data.id)
    return {"correct": correct}

class AnswerData(BaseModel):
    id: str
    password: str
    subject: Optional[str] = None

class ProgressData(BaseModel):
    id: str
    password: str
    problem_set: str
    summary: dict  # {learned, learning, unlearned, total}
    details: dict  # {answeredQuestions, questionStats, etc.}

@app.post("/api/add_correct")
async def add_correct(data: AnswerData):
    password = await DB.password(data.id)
    if password is None or password != data.password:  # type: ignore
        return {"message": "password is wrong or user not found"}
    
    # ユーザーの正解データを更新（内部でmondai_statsも更新される）
    await DB.add_correct(data.id, data.subject)
    return {"message": "add_correct successful"}

@app.post("/api/add_bad")
async def add_bad(data: AnswerData):
    password = await DB.password(data.id)
    if password is None or password != data.password:  # type: ignore
        return {"message": "password is wrong or user not found"}
    
    # ユーザーの不正解データを更新（内部でmondai_statsも更新される）
    await DB.add_bad(data.id, data.subject)
    return {"message": "add_bad successful"}

@app.post("/api/get_bad")
async def get_bad(data: Data):
    password = await DB.password(data.id)
    if password is None or password != data.password:  # type: ignore
        return {"message": "password is wrong or user not found"}
    bad = await DB.get_bad(data.id)
    return {"bad": bad}

@app.post("/api/get")
async def get_user(data: Data):
    password = await DB.password(data.id)
    if password is None or password != data.password:  # type: ignore
        return {"message": "password is wrong or user not found"}
    # fetch base user data
    user_data = await DB.get(data.id)
    if user_data:
        # include progress summary
        progress_summary = await DB.get_progress_summary(data.id)
        user_data["progress_summary"] = progress_summary
    return user_data

@app.post("/api/get/user")
async def get_all(data: Data):
    password = await DB.password(data.id)
    if password is None or password != data.password:  # type: ignore
        return {"message": "password is wrong or user not found"}
    return await DB.get_all(data.id)

@app.get("/api/ranking")
async def ranking(
    count: int = Query(20, ge=1, le=20),
    sort_by: str = Query("total", enum=["correct", "accuracy", "total"]),
    period: Optional[str] = Query(None, enum=["7d", "30d"])
):
    async with async_session() as session:
        if period in ["7d", "30d"]:
            days = 7 if period == "7d" else 30
            from_date = (datetime.now() - timedelta(days=days)).date()
            
            user_stats = []
            
            # stream_scalarsを使用して、一度に全ユーザーをメモリにロードするのを防ぎ、メモリ効率を向上
            result = await session.stream_scalars(sa_select(Account))
            async for user in result:
                correct_count_period = 0
                bad_count_period = 0
                
                correct_data = DB.safe_load_json(user.correctdata)  # type: ignore
                for date_str, subjects in correct_data.items():
                    try:
                        # 日付文字列をdatetimeオブジェクトに変換
                        date_obj = datetime.strptime(date_str, "%Y/%m/%d").date()
                        if date_obj >= from_date and isinstance(subjects, dict):
                            # 値が数値でない場合を考慮して安全に合計
                            correct_count_period += sum(v for v in subjects.values() if isinstance(v, int))
                    except ValueError:
                        # 日付フォーマットが不正な場合はスキップ
                        continue

                bad_data = DB.safe_load_json(user.baddata)  # type: ignore
                for date_str, subjects in bad_data.items():
                    try:
                        # 日付文字列をdatetimeオブジェクトに変換
                        date_obj = datetime.strptime(date_str, "%Y/%m/%d").date()
                        if date_obj >= from_date and isinstance(subjects, dict):
                            bad_count_period += sum(v for v in subjects.values() if isinstance(v, int))
                    except ValueError:
                        # 日付フォーマットが不正な場合はスキップ
                        continue
                
                total = correct_count_period + bad_count_period
                if total > 0:
                    user_stats.append({
                        "userid": user.userid,
                        "correct": correct_count_period,
                        "bad": bad_count_period,
                        "total": total,
                        "accuracy": (correct_count_period / total) * 100 if total > 0 else 0
                    })
            
            # ソート処理
            if sort_by == "accuracy":
                user_stats.sort(key=lambda x: x["accuracy"], reverse=True)
            elif sort_by == "total":
                user_stats.sort(key=lambda x: x["total"], reverse=True)
            else:
                user_stats.sort(key=lambda x: x["correct"], reverse=True)
                
            # 上位N件を抽出
            ranking_list = [
                {"userid": u["userid"], "correct": u["correct"], "bad": u["bad"]}
                for u in user_stats[:count]
            ]
        else:
            # 既存の累計ランキングロジック
            if sort_by == "accuracy":
                accuracy_expr = func.cast(Account.correct, Float) / (Account.correct + Account.bad)
                query = sa_select(
                    Account.userid,
                    Account.correct,
                    Account.bad,
                    accuracy_expr.label('accuracy')
                ).where(
                    (Account.correct + Account.bad) > 0
                ).order_by(desc('accuracy')).limit(count)
            elif sort_by == "total":
                total_expr = Account.correct + Account.bad
                query = sa_select(
                    Account.userid,
                    Account.correct,
                    Account.bad
                ).where(
                    total_expr > 0
                ).order_by(desc(total_expr)).limit(count)
            else:
                query = sa_select(
                    Account.userid,
                    Account.correct,
                    Account.bad
                ).where(
                    (Account.correct + Account.bad) > 0
                ).order_by(desc(Account.correct)).limit(count)

            result = await session.execute(query)
            
            ranking_list = [
                {"userid": row[0], "correct": row[1], "bad": row[2]}
                for row in result.fetchall()
            ]

    return ranking_list


def is_valid_username(username: str) -> bool:
    """ユーザ名が有効か判定する"""
    USERNAME_PATTERN = re.compile(r'^[A-Za-z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+$')
    return bool(USERNAME_PATTERN.fullmatch(username))

@app.post("/api/change/name/{newname}")
async def change_name(data: Data, newname: str):
    if not is_valid_username(newname):
        return JSONResponse(
            status_code=400,
            content={"message": "ユーザー名に使用できない文字が含まれています。英数字、ひらがな、カタカナ、漢字のみ使用可能です。"}
        )

    # バリデーション
    if len(newname) < 3:
        return JSONResponse(
            status_code=400,
            content={"message": "ユーザー名は3文字以上で、英数字、ひらがな、カタカナ、漢字のみ使用できます。"}
        )

    # パスワード検証
    password = await DB.password(data.id)
    if password is None or password != data.password:  # type: ignore
        return JSONResponse(status_code=403, content={"message": "パスワードが違うか、ユーザーが見つかりません。"})

    # 現在のユーザー名と同じ場合は何もしない
    if data.id == newname:
        return JSONResponse(status_code=200, content={"message": "既に同じユーザー名の為、変更されていません。", "newname": newname})

    async with async_session() as session:
        async with session.begin(): # トランザクションを開始
            # 新しいユーザー名の重複チェック
            result = await session.execute(sa_select(Account).filter_by(userid=newname))
            if result.scalar_one_or_none():
                return JSONResponse(status_code=409, content={"message": f"ユーザー名「{newname}」は既に使用されています。"})

            # 現在のユーザーを取得
            result = await session.execute(sa_select(Account).filter_by(userid=data.id))
            user: Optional[Account] = result.scalar_one_or_none()
            
            if user:
                old_userid = data.id
                
                # 新しいアカウントオブジェクトを作成し、データをコピー
                new_user = Account(
                    userid=newname,
                    password=user.password,
                    correct=user.correct,
                    bad=user.bad,
                    correctdata=user.correctdata,
                    baddata=user.baddata,
                    progress_data=user.progress_data,
                    progress_details=user.progress_details
                )

                # 関連するMondaiテーブルのuseridを更新
                mondai_result = await session.execute(sa_select(Mondai).filter_by(userid=old_userid))
                user_mondais = mondai_result.scalars().all()
                for mondai in user_mondais:
                    mondai.userid = newname  # type: ignore # sanitized_newname を newname に変更
                
                # 古いユーザーを削除し、新しいユーザーを追加
                await session.delete(user)
                session.add(new_user)

                return JSONResponse(content={"message": "ユーザー名を変更しました。", "newname": newname})

    return JSONResponse(status_code=404, content={"message": "ユーザーが見つかりません。"})

@app.post("/api/change/password/{newpassword}")
async def change_password(data: Data, newpassword: str):
    password = await DB.password(data.id)
    if password is None or password != data.password:  # type: ignore
        return {"message": "password is wrong or user not found"}
    async with async_session() as session:
        result = await session.execute(sa_select(Account).filter_by(userid=data.id))
        user: Optional[Account] = result.scalar_one_or_none()
        if user:
            user.password = newpassword  # type: ignore
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
    password = await DB.password(data.userid)
    if password is None or password != data.password:  # type: ignore
        return {"message": "password is wrong or user not found"}
    await DB.save_mondai(data.name, data.userid, data.mondai)
    return {"status": "success"}

@app.post("/api/upload/image")
async def upload_image(file: UploadFile = File(...), usage: str = Query("ai", enum=["ai", "problem"])):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400, detail="File is not an image."
        )

    try:
        # Read the file contents
        contents = await file.read()

        # Check file size (15MB limit per image)
        if len(contents) > 15 * 1024 * 1024:  # 15MB in bytes
            raise HTTPException(
                status_code=400, 
                detail="画像ファイルのサイズが15MBの上限を超えています。"
            )

        # Validate as a picture
        try:
            def process_image(data):
                img = Image.open(io.BytesIO(data))
                img.verify()  # 画像の検証
                return img

            img = await run_in_threadpool(process_image, contents)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid image format or corrupted image: {e}")

        # Create file ID using hash of content and original filename
        file_id = xxhash.xxh64(contents).hexdigest()

        # Determine save path based on usage
        if usage == "ai":
            # AI用: tempディレクトリに保存（元の形式維持）
            os.makedirs("./data/upload/temp/img", exist_ok=True)
            file_path = f"./data/upload/temp/img/{file_id}"
            await run_in_threadpool(img.save, file_path, format=img.format or "JPEG")
        else:
            # 問題文用: upload/imgディレクトリにwebpで保存
            os.makedirs("./data/upload/img", exist_ok=True)
            file_path = f"./data/upload/img/{file_id}.webp"
            # WebP形式で保存（品質を90に設定）
            await run_in_threadpool(img.save, file_path, format="WEBP", quality=90)
        
        return JSONResponse(
            content={
                "id": file_id,
                "filename": file.filename,
                "format": "webp" if usage == "problem" else img.format or "JPEG",
                "path": file_path,
                "message": "Image uploaded successfully."
            },
            status_code=200
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"There was an error uploading the file: {str(e)}"
        )
    finally:
        await file.close()

# BaseModelの定義
class ImageData(BaseModel):
    id: str
    custom_prompt: Optional[str] = None

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
                    # 内部詳細はログにのみ出力し、クライアントへは一般メッセージを返す
                    print(f"[process_text] item_index={i} error={type(err).__name__}: {err}")
                    results.append({
                        "feedback": "この問題の処理中にエラーが発生しました。",
                        "index": i,
                        "status": "error"
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
            content={"status": "failed", "message": "テキスト処理中にエラーが発生しました"},
            status_code=500
        )

def extract_questions_from_text(text):
    """テキストから質問と回答のペアを抽出するバックアップ機能"""
    questions = []
    
    # パターン1: 「質問: 回答」形式を検出
    qa_pairs = re.findall(r'(?:質問|Q)[：:]\s*([^\n]+)(?:\n|$).*?(?:回答|A)[：:]\s*([^\n]+)', text, re.DOTALL)
    for q, a in qa_pairs:
        questions.append({"question": q.strip(), "answer": a.strip()})
    
    # パターン2: 番号付きリスト形式を検出
    numbered_items = re.findall(r'(?:^|\n)(\d+)[\.、\)）]\s*([^\n]+)(?:\n|$)', text)
    if numbered_items and len(numbered_items) >= 2:
        # 偶数番号が回答、奇数番号が質問と仮定
        for i in range(0, len(numbered_items), 2):
            if i+1 < len(numbered_items):
                _, q_text = numbered_items[i]
                _, a_text = numbered_items[i+1]
                questions.append({"question": q_text.strip(), "answer": a_text.strip()})
    
    # 最低2つの質問を確保
    if len(questions) < 2:
        # テキストを簡単に分割して質問を作成
        sentences = re.split(r'[。\.!！?？\n]+', text)
        sentences = [s.strip() for s in sentences if len(s.strip()) > 10]  # 短すぎる文は除外
        
        if len(sentences) >= 2:
            for i, sentence in enumerate(sentences[:2]):
                questions.append({
                    "question": f"次の内容について説明してください: {sentence[:30]}...",
                    "answer": sentence
                })
    
    return questions

@app.post("/api/process/image")
async def process_image(data: Union[ImageData, TextData]):
    # テキスト処理の場合
    if isinstance(data, TextData):
        return await process_text(data)

    # Unionとisinstanceガードにより、ここからはdataがImageDataであることが保証される
    if not isinstance(data, ImageData):
        raise HTTPException(status_code=400, detail="Invalid request data type")
    
    # 画像処理の場合
    image_path = f"./data/upload/temp/img/{data.id}"
    if not os.path.exists(image_path):
        raise HTTPException(
            status_code=404,
            detail="Image not found"
        )

    try:
        # 画像を開く
        image = Image.open(image_path)
        
        question_generation_prompt = """
            あなたは優秀な教育アシスタントです。
            以下の画像に基づいて、学習者が内容を効率的に覚え、理解を深めるための勉強に活用できる問題を作成してください。

            # 指示概要
            - 提供されたテキストデータから、重要な情報を問う一問一答形式の問題を作成します。
            - 特に、テキスト中で強調されていると思われる語句（例えば、画像で赤文字だった箇所や太字だった箇所など、文脈から重要と判断できるキーワードや概念）を中心に出題してください。
            - 問題文と回答は、提供されたテキストの内容に忠実である必要があります。
            - 画像が極度に不鮮明な場合は、{"error","img unclear"}と返してください。
            - 問題を作成するためのデータが極端に不足している場合は、{"error","data shortage"}と返してください。

            # 問題作成の要件
            - 各問題文は、簡潔かつ明確にしてください。質問の意図が曖昧にならないように注意してください。
            - 各回答は、正確かつ簡潔で、学習者にとって分かりやすいものにしてください。
            - 1つの問題に対して、回答は1つになるようにしてください。
            - 問題数は、テキストの内容量に応じて適切に調整してください（例：5問～15問程度）。

            # 出力形式
            以下のJSON形式で、問題と回答のリストを返してください。
            各要素は `question` (問題文) と `answer` (回答) のキーを持つオブジェクトとします。

            出力例:
            ```json
            [
                {"question": "経済において基本的な活動とされるものは何と何か？", "answer": "生産と消費"},
                {"question": "財やサービスをつくりだす行為を経済学で何と呼びますか？", "answer": "生産"},
                {"question": "生産に必要な3要素とは何ですか？", "answer": "労働力、土地、資本"}
            ]
            ```
            """
        
        if data.custom_prompt:
            question_generation_prompt += data.custom_prompt

        # reqAI関数を使用して画像処理を実行
        question_response_text = await reqAI(
            prompt=question_generation_prompt,
            model="gemini-2.5-flash",
            images=image
        )

        # AIからのエラー時の処理
        if question_response_text.startswith("{\"error") or question_response_text.startswith("error"):
            # エラーメッセージを解析
            error_message = question_response_text.split(":")[1].strip().strip("\"")
            if error_message == "img unclear":
                return JSONResponse(
                    content={
                        "status": "failed",
                        "message": "画像が不鮮明です。"
                    },
                    status_code=400
                )
            elif error_message == "data shortage":
                return JSONResponse(
                    content={
                        "status": "failed",
                        "message": "データが不足しています。"
                    },
                    status_code=400
                )
            else:
                return JSONResponse(
                    content={
                        "status": "failed",
                        "message": f"AIからのエラー: {error_message}"
                    },
                    status_code=400
                )

        # JSONパターンを抽出（APIの応答からJSONを抽出）
        # 応答が直接JSON文字列である場合も考慮
        questions = []
        json_str_debug = "" # デバッグ用にJSON文字列を保持
        try:
            # まず ```json ... ``` ブロックを探す
            json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', question_response_text, re.DOTALL)
            if json_match:
                json_str_debug = json_match.group(1).strip()
            else:
                # ```json ... ``` がなければ、応答全体がJSONかもしれないと仮定
                json_str_debug = question_response_text.strip()
            
            # 稀に "```json" のみが返ってくることがあるので、空文字列チェック
            if json_str_debug:
                parsed_json = json.loads(json_str_debug)
                # json.loads がリストを返すことを期待
                if isinstance(parsed_json, list):
                    questions = parsed_json
                # もし辞書で、その中に 'questions' キーがあればそれを使う (柔軟性のため)
                elif isinstance(parsed_json, dict) and "questions" in parsed_json and isinstance(parsed_json["questions"], list):
                    questions = parsed_json["questions"]
                else:
                    # 期待する形式でない場合はエラーとして扱う
                    print(f"Unexpected JSON structure: {parsed_json}")
        except json.JSONDecodeError as e:
            print(f"JSONDecodeError: {e} in response: {json_str_debug[:100]}...")
            # JSONが正しく解析できなかった場合、AIに修正してもらう
            try:
                fix_prompt = f"""以下のテキストから、正しいJSON形式の問題と回答のリストを抽出してください。
                出力は以下の形式でお願いします：
                ```json
                [
                    {{"question": "問題文", "answer": "回答"}},
                    {{"question": "問題文2", "answer": "回答2"}}
                ]
                ```

                元のテキスト:
                {question_response_text}"""
                
                fixed_response = await reqAI(fix_prompt)
                
                # 修正されたレスポンスからJSONを再抽出
                fixed_json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', fixed_response, re.DOTALL)
                if fixed_json_match:
                    fixed_json_str = fixed_json_match.group(1).strip()
                    parsed_json = json.loads(fixed_json_str)
                    if isinstance(parsed_json, list):
                        questions = parsed_json
                    elif isinstance(parsed_json, dict) and "questions" in parsed_json:
                        questions = parsed_json["questions"]
                else:
                    # 修正後も抽出できない場合はフォールバック
                    questions = extract_questions_from_text(question_response_text)
            except Exception as fix_error:
                print(f"Error fixing JSON: {fix_error}")
                questions = extract_questions_from_text(question_response_text)
        except Exception as e:
            print(f"Error parsing questions: {type(e).__name__}: {e}")
            print(f"Original text snippet: {question_response_text[:200]}...")
            questions = extract_questions_from_text(question_response_text)
            
        # 形式検証と代替処理
        if not isinstance(questions, list):
            print(f"Invalid response format: expected list, got {type(questions)}")
            questions = extract_questions_from_text(question_response_text)
        elif not all(isinstance(q, dict) and "question" in q and "answer" in q for q in questions):
            print(f"Invalid question format in response: {questions[:3]}...")
            # 形式が一部正しい場合は、正しい部分だけを抽出
            valid_questions = [q for q in questions if isinstance(q, dict) and "question" in q and "answer" in q]
            if valid_questions:
                questions = valid_questions
            else:
                questions = extract_questions_from_text(question_response_text)
            
        # 最終的に質問が見つからなかった場合のフォールバック
        if not questions:
            return JSONResponse(
                content={
                    "status": "failed",
                    "message": "No questions generated from the image."
                },
                status_code=400
            )
        
        return JSONResponse(
            content={
                "status": "success",
                "questions": questions
            },
            status_code=200
        )
    except Exception as e:
        print(f"Error in image processing: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error processing image: {str(e)}"
        )
    finally:
        # 画像処理完了（ファイルは定期クリーンアップで1時間後に削除される）
        print(f"Image processing completed: {image_path}")

@app.post("/api/edit/mondai")
async def edit_mondai(data: MondaiData):
    password = await DB.password(data.userid)
    if password is None or password != data.password:  # type: ignore
        return {"message": "password is wrong or user not found"}
    
    status = await DB.edit_mondai(data.name, data.userid, data.mondai)

    if status:
        return {"status": "success"}
    else:
        return {"status": "failed"}

@app.get("/api/get/mondai/{name}.json")
async def get_mondai(name: str, start: Optional[int] = None, end: Optional[int] = None, ranges: Optional[str] = None):

    # パスインジェクション対策：ファイル名のみを抽出し、ディレクトリトラバーサルを防止
    safe_name = os.path.basename(name)
    path = f"./data/mondaiset/{safe_name}.txt"
    
    # 絶対パスを取得して、意図したディレクトリ内にあるか確認
    abs_path = os.path.abspath(path)
    intended_dir = os.path.abspath("./data/mondaiset")
    if not abs_path.startswith(intended_dir) or not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail="Not found")
    # まずコメント行と空行を除いた全ての問題行を読み込む
    lines = []
    async with aiofiles.open(abs_path, mode="r", encoding="utf-8") as f:
        async for raw in f:
            line = raw.strip()
            if line and not line.startswith('#'):
                lines.append(line)

    results = []

    # ranges パラメータが指定されている場合
    if ranges:
        selected_indices = set()
        for part in ranges.split(','):
            if '-' in part:
                try:
                    start_range, end_range = map(int, part.split('-'))
                    # 1始まりを0始まりのインデックスに変換
                    for i in range(start_range - 1, end_range):
                        selected_indices.add(i)
                except ValueError:
                    continue # 不正なフォーマットは無視

        if not selected_indices:
            return []
        
        for index in sorted(list(selected_indices)):
            if index < len(lines):
                results.append(lines[index])

    # 従来の start/end パラメータの場合
    elif start is not None and end is not None:
        # 1始まりを0始まりのインデックスに変換
        start_index = max(start - 1, 0)
        end_index = end
        
        if start_index < len(lines):
            results = lines[start_index:end_index]

    else: # パラメータがない場合は全件返す
        results = lines

    if not results:
        raise HTTPException(status_code=404, detail="Not found or no matching lines")

    return results

sentences_cache: List[str] = []

@app.post("/api/get/sentences")
async def get_sentences(request: Request):
    global sentences_cache
    try:
        # Parse JSON request body
        data = await request.json()
        words = data.get("words", [])

        if not isinstance(words, list):
            raise HTTPException(status_code=400, detail="Request must contain a 'words' array")

        words = words[:500]

        # ハードコードされたパスだが、一貫性のためにセキュアな方法で処理
        path = f"./data/sentence.txt"
        abs_path = os.path.abspath(path)
        intended_dir = os.path.abspath("./data")
        if not abs_path.startswith(intended_dir) or not os.path.isfile(path):
            raise HTTPException(status_code=404, detail="Sentence file not found")

        results = {}

        words_map = {word.lower(): word for word in words}
        
        # 静的キャッシュ変数を定義
        if not sentences_cache:
            
            # ファイルが大きい場合のパフォーマンス改善策
            # バッチサイズを大きくして一度に読み込む行数を増やす
            batch_size = 1000
            sentences_batch = []
            
            # 検証済みの絶対パスを使用
            async with aiofiles.open(abs_path, mode="r", encoding="utf-8") as f:
                batch_count = 0
                async for line in f:
                    line = line.strip()
                    if line:
                        sentences_batch.append(line)
                        batch_count += 1
                        
                        # バッチサイズに達したらキャッシュに追加
                        if batch_count >= batch_size:
                            sentences_cache.extend(sentences_batch)
                            sentences_batch = []
                            batch_count = 0
                            
                # 残りのバッチをキャッシュに追加
                if sentences_batch:
                    sentences_cache.extend(sentences_batch)
            
        all_sentences = sentences_cache

        for word_lower, original_word in words_map.items():
            matching_sentences = []

            # 文字列長に制限を設けて、ReDoS脆弱性を軽減
            if len(word_lower) > 100:  # 合理的な単語の長さ制限
                word_lower = word_lower[:100]
            pattern = r"\b" + re.escape(word_lower) + r"\b"

            for sentence in all_sentences:
                if re.search(pattern, sentence.lower()):
                    matching_sentences.append(sentence)
                    if len(matching_sentences) >= 5:
                        break
            results[original_word] = matching_sentences

        return {"results": results}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving sentences: {str(e)}"
        )

@app.get("/api/get/mondai/{userid}/{name}.json")
async def get_user_mondai(userid: str, name: str):
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
    if not data.id:
        return {"message": "user id is required"}
    password = await DB.password(data.id)
    if password is None or password != data.password:  # type: ignore
        return {"message": "password is wrong or user not found"}
    
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
    # パスワード検証
    password = await DB.password(data.userid)
    if password is None or password != data.password:  # type: ignore
        return {"message": "password is wrong or user not found"}
    
    # 公開状態の切り替え
    result = await DB.toggle_mondai_visibility(data.name, data.userid)
    
    # 結果に基づいて適切なレスポンスを返す
    return (
        {"status": "success", "is_public": result["is_public"]}
        if result else
        {"status": "failed", "message": "Problem not found"}
    )

@app.post("/api/dashboard/delete")
async def delete_problem(data: MondaiIdData):
    """
    問題を削除するAPI
    """
    password = await DB.password(data.userid)
    if password is None or password != data.password:  # type: ignore
        return {"message": "password is wrong or user not found"}
    
    try:
        success = await DB.delete_mondai(data.name, data.userid)
        if success:
            return {"status": "success"}
        else:
            return {"status": "failed", "message": "Problem not found"}
    except Exception as e:
        return {"status": "error", "message": "問題の削除中にエラーが発生しました"}

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
    password = await DB.password(data.userid)
    if password is None or password != data.password:  # type: ignore
        return {"message": "password is wrong or user not found"}
    
    async with async_session() as session:
        async with session.begin(): # トランザクションを開始
            # オリジナルの問題を取得
            mondai = await DB.get_mondai(data.userid, data.original_name)
            if not mondai:
                return {"status": "failed", "message": "Original problem not found"}
            
            try:
                # 同名の問題を削除 (トランザクション内で実行)
                await DB.delete_mondai(data.new_name, data.userid, session=session)
                
                # 新しい名前で保存 (トランザクション内で実行)
                await DB.save_mondai(data.new_name, data.userid, mondai, True, session=session)
                
                # commitはsession.begin()が自動で行うため不要
                return {"status": "success"}
            except Exception as e:
                # エラーが発生した場合は自動的にロールバックされる
                print(f"Error duplicating problem: {e}")
                return {"status": "failed", "message": "問題の複製中にエラーが発生しました"}

@app.post("/api/dashboard/stats")
async def get_problem_stats(data: MondaiIdData, request: Request):
    """
    問題の使用統計を取得するAPI
    """
    password = await DB.password(data.userid)
    if password is None or password != data.password:  # type: ignore
        return {"message": "password is wrong or user not found"}
    
    # 指定された問題の存在確認
    user_id = request.cookies.get("id")
    if not user_id:
        return {"status": "failed", "message": "User not logged in"}

    mondai_data = await DB.get_mondai(user_id, data.name)
    if not mondai_data:
        return {"status": "failed", "message": "Problem not found"}
    
    # MondaiStats テーブルから統計情報を取得
    stats = await DB.get_mondai_stats(data.name)
    
    return {
        "status": "success",
        "stats": stats
    }

@app.post("/api/save_progress")
async def save_progress(data: ProgressData):
    """
    ユーザーの学習進捗データを保存するエンドポイント
    """
    password = await DB.password(data.id)
    if password is None or password != data.password:  # type: ignore
        return {"message": "password is wrong or user not found"}

    success = await DB.save_progress_data(data.id, data.problem_set, data.summary, data.details)
    if success:
        return {"message": "progress data saved successfully"}
    return {"message": "failed to save progress data"}

class GetProgressData(BaseModel):
    id: str
    password: str
    problem_set: str

@app.post("/api/get_progress")
async def get_progress(data: GetProgressData):
    """
    特定の問題セットに関するユーザーの学習進捗データを取得するエンドポイント
    """
    password = await DB.password(data.id)
    if password is None or password != data.password:  # type: ignore
        return {"message": "password is wrong or user not found"}
    
    # 進捗データを取得
    details_data = await DB.get_progress_data(data.id, data.problem_set)
    return {"progress_details": details_data}

@app.post("/api/get_all_progress")
async def get_all_progress(data: Data):
    """
    ユーザーの全問題セットの学習進捗データを一括で取得するエンドポイント
    """
    password = await DB.password(data.id)
    if password is None or password != data.password:  # type: ignore
        return {"message": "password is wrong or user not found"}
    
    # 全問題セットの進捗データを取得
    all_details_data = await DB.get_progress_data(data.id)
    return {"all_progress_details": all_details_data}

class WordData(BaseModel):
    word: str
    mondai: str

@app.post("/api/search")
async def search_problems(query: str = Query(..., min_length=1)):
    """
    問題を検索するAPIエンドポイント
    """
    results = []
    
    # クエリを小文字に変換して前処理
    query_lower = query.lower()
    
    # 1. 範囲検索パターンの検出 (例：「801-850」)
    # ReDoS対策：正規表現を改善し、非数字の繰り返しに上限を設定
    # ReDoS脆弱性対策：バックトラッキングを制限する安全な正規表現
    range_match = re.search(r'(\d{1,6})[-~〜から](\d{1,6})', query)
    range_keywords = []
    if range_match:
        start_num, end_num = int(range_match.group(1)), int(range_match.group(2))
        if start_num < end_num:
            # 範囲が検出されたら、追加のキーワードとして保存
            range_keywords = [f"{start_num}-{end_num}", f"{start_num}から{end_num}", f"{start_num}～{end_num}"]
    
    # 2. ユーザー作成の問題を検索（Mondaiテーブル）
    try:
        async with async_session() as session:
            # 公開状態の問題のみ検索
            stmt = sa_select(Mondai).filter(
                (Mondai.is_public == 1) &
                ((Mondai.name.ilike(f'%{query}%')) |
                (Mondai.mondai.ilike(f'%{query}%')))
            ).limit(20)
            
            result = await session.execute(stmt)
            user_problems = result.scalars().all()
            
            for problem in user_problems:
                results.append({
                    "title": problem.name,
                    "type": "ユーザー作成",
                    "author": problem.userid,
                    "url": f"/play/?userid={problem.userid}&name={problem.name}"
                })
    except Exception as e:
        print(f"ユーザー問題検索エラー: {e}")

    # 3. 既存の問題ファイルを検索（static/detaディレクトリ）
    deta_files = []
    try:
        deta_dir = Path("static/deta")
        if deta_dir.exists() and deta_dir.is_dir():
            for file_path in deta_dir.glob("*.txt"):
                file_name = file_path.stem
                file_name_lower = file_name.lower()
                
                # ファイル名に検索クエリが含まれている場合
                if query_lower in file_name_lower:
                    deta_files.append((file_name, 100)) # 優先度を高く設定
                elif any(kw.lower() in file_name_lower for kw in range_keywords):
                    deta_files.append((file_name, 90))  # 範囲検索でマッチするケース
                else:
                    # 部分一致検索（単語単位でマッチする場合）
                    query_words = query_lower.split()
                    file_words = file_name_lower.split()
                    match_count = sum(1 for qw in query_words if any(qw in fw for fw in file_words))
                    if match_count > 0:
                        # 部分一致の数に応じて優先度を設定
                        deta_files.append((file_name, 80 + match_count))
                    else:
                        # ファイルの内容も検索（最初の20行）
                        try:
                            async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
                                lines = [await f.readline() for _ in range(20)]
                                content = "".join(lines)
                                content_lower = content.lower()
                                if query_lower in content_lower:
                                    deta_files.append((file_name, 70))
                                elif any(kw.lower() in content_lower for kw in range_keywords):
                                    deta_files.append((file_name, 60))
                        except Exception as e:
                            print(f"ファイル内容検索エラー: {e}")
        
        # 優先度でソートして結果に追加
        deta_files.sort(key=lambda x: -x[1])  # 優先度の高い順にソート
        
        # 結果に追加
        for file_name, _ in deta_files:
            results.append({
                "title": file_name,
                "type": "システム問題",
                "author": "システム",
                "url": f"/play/?id={file_name}"
            })
    except Exception as e:
        print(f"既存問題検索エラー: {e}")

    # 4. BOOK_RANGES データから、範囲検索のための結果を作成
    if range_match:
        start_num, end_num = int(range_match.group(1)), int(range_match.group(2))
        for book_id, ranges in BOOK_RANGES.items():
            for range_item in ranges:
                if  (start_num == range_item["start"] and end_num == range_item["end"]) or \
                    (start_num <= range_item["start"] and end_num >= range_item["end"]) or \
                    (start_num >= range_item["start"] and start_num <= range_item["end"]) or \
                    (end_num >= range_item["start"] and end_num <= range_item["end"]):
                    # 範囲が重なる場合、結果に追加
                    results.append({
                        "title": f"{book_id} {range_item['label']}",
                        "type": "範囲検索",
                        "author": "システム",
                        "url": f"/play/?id={book_id}&start={range_item['start']}&end={range_item['end']}"
                    })

    # 5. Mondai_stats テーブルから人気の問題を取得して追加
    try:
        async with async_session() as session:
            stmt = sa_select(MondaiStats).filter(
                MondaiStats.mondai_name.ilike(f'%{query}%')
            ).order_by(MondaiStats.usage_count.desc()).limit(10)
            
            result = await session.execute(stmt)
            popular_problems = result.scalars().all()
            
            for problem in popular_problems:
                # 既に追加されていなければリストに追加
                if not any(r["title"] == problem.mondai_name for r in results):
                    results.append({
                        "title": problem.mondai_name,
                        "type": "人気の問題",
                        "author": "システム",
                        "url": f"/play/?id={problem.mondai_name}"
                    })
    except Exception as e:
        print(f"統計情報検索エラー: {e}")

    # 重複を削除し、最大50件に制限
    unique_titles = set()
    filtered_results = []
    for item in results:
        if item["title"] not in unique_titles and len(filtered_results) < 50:
            unique_titles.add(item["title"])
            filtered_results.append(item)
    
    return filtered_results

class DictSearchData(BaseModel):
    word: str
    batch_words: Optional[List[str]] = None

@app.post("/api/dict/search")
async def fast_dict_search(data: DictSearchData):
    """
    高速辞書検索API - 単語または複数単語の意味を瞬時に検索
    """
    global fast_dict
    
    if not fast_dict:
        return {
            "success": False,
            "error": "辞書システムが利用できません"
        }
    
    try:
        if data.batch_words:
            # 複数単語検索
            results = fast_dict.batch_search(data.batch_words)
            formatted_results = {}
            
            for word, word_data in results.items():
                if word_data:
                    formatted_results[word] = {
                        "found": True,
                        "meanings": word_data.get('ja', []),
                        "pos": word_data.get('pos', ''),
                        "rank": word_data.get('rank'),
                        "past_tense": word_data.get('past_tense', ''),
                        "past_participle": word_data.get('past_participle', '')
                    }
                else:
                    formatted_results[word] = {
                        "found": False,
                        "meanings": [],
                        "pos": "",
                        "rank": None,
                        "past_tense": "",
                        "past_participle": ""
                    }
            
            return {
                "success": True,
                "type": "batch",
                "total_words": len(data.batch_words),
                "found_count": sum(1 for r in formatted_results.values() if r["found"]),
                "results": formatted_results
            }
        else:
            # 単語検索
            word_data = fast_dict.search_word(data.word)
            
            if word_data:
                # 過去形・過去分詞の情報を追加
                
                return {
                    "success": True,
                    "type": "single",
                    "word": data.word,
                    "found": True,
                    "meanings": word_data.get('ja', []),
                    "pos": word_data.get('pos', ''),
                    "rank": word_data.get('rank'),
                    "past_tense": word_data.get('past_tense', ''),
                    "past_participle": word_data.get('past_participle', '')
                }
            else:
                return {
                    "success": True,
                    "type": "single",
                    "word": data.word,
                    "found": False,
                    "meanings": [],
                    "pos": "",
                    "rank": None,
                    "past_tense": "",
                    "past_participle": ""
                }
    
    except Exception as e:
        print(f"Dictionary search error: {e}")
        return {
            "success": False,
            "error": "検索中にエラーが発生しました"
        }

@app.get("/api/dict/quick/{word}")
async def quick_dict_search(word: str):
    """
    超高速単語検索API（GETリクエスト版）
    """
    global fast_dict
    
    if not fast_dict:
        return {"found": False, "error": "辞書システムが利用できません"}
    
    try:
        word_data = fast_dict.search_word(word)
        
        if word_data:
            return {
                "found": True,
                "word": word,
                "meanings": word_data.get('ja', []),
                "pos": word_data.get('pos', ''),
                "rank": word_data.get('rank')
            }
        else:
            return {
                "found": False,
                "word": word
            }
    except Exception as e:
        # 内部詳細はログにのみ出力し、クライアントには一般化したメッセージのみ返す
        print(f"[quick_dict_search] error={type(e).__name__}: {e}")
        return {"found": False, "error": "内部エラーが発生しました"}

@app.post("/api/search/word/")
async def search_word(data: WordData):
    """
    辞書APIから単語の意味を取得するエンドポイント（AI生成説明付き）
    """
    global fast_dict
    word = data.word
    
    if not word:
        return {
            "word": word,
            "definition": "単語が指定されていません。",
            "success": False
        }

    # まず高速辞書で検索
    basic_info = ""
    if fast_dict:
        try:
            word_data = fast_dict.search_word(word)
            if word_data:
                meanings = word_data.get('ja', [])
                pos = word_data.get('pos', '')
                rank = word_data.get('rank', '')
                
                basic_info = f"""
        【辞書情報】
        意味: {', '.join(meanings[:3])}
        品詞: {pos}
        ランク: {rank}

        """
        except:
            pass

    try:
        # AIによる詳細説明
        prompt = f"""以下の単語「{word}」について詳しく説明してください。
        
        {basic_info}
        
        以下の情報を含めてください：
        1. 基本的な定義と意味
        2. 実際の使用例（例文を2-3つ）
        3. 関連する単語や類義語（あれば）
        4. 特定分野での専門的な意味（該当する場合）
        5. 「{data.mondai}」の文脈に関連した説明
        
        回答は簡潔かつ分かりやすい日本語で、150-250字程度でまとめてください。
        また、HTMLタグは使用せず、マークダウン形式で回答してください。"""

        response = await reqAI(prompt, "gemini-2.5-flash")
        return {
            "word": word,
            "definition": response,
            "success": True
        }
    except Exception as e:
        print(f"Error fetching definition: {e}")
        # AIが失敗した場合、辞書データのみ返す
        if basic_info:
            return {
                "word": word,
                "definition": basic_info.strip(),
                "success": True
            }
        return {
            "word": word,
            "definition": "定義を取得できませんでした。",
            "success": False,
            "error": "内部エラーが発生しました"
        }

@app.get("/api/gen/speak/{word}")
async def gen_speak(word: str):
    # データディレクトリの作成
    audio_dir = "./data/audio"
    os.makedirs(audio_dir, exist_ok=True)
    
    # ファイルチェック
    filename = f"{audio_dir}/{xxhash.xxh64(word).hexdigest()}.mp3"

    if os.path.exists(filename):
        return FileResponse(filename, media_type="audio/mpeg", filename=f"{word}.mp3")
    
    lang = "ja" if re.search(r'[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]', word) else "en"

    try:
        def generate_audio(text, lang):
            tts = gTTS(text=text, lang=lang, slow=True)
            audio_bytes = BytesIO()
            tts.write_to_fp(audio_bytes)
            return audio_bytes.getvalue()

        audio_data = await run_in_threadpool(generate_audio, word, lang)
        
        async with aiofiles.open(filename, "wb") as f:
            await f.write(audio_data)
        return FileResponse(filename, media_type="audio/mpeg", filename=f"{word}.mp3")
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
    prompt = f"""「{word}」という単語を使って、リスニング問題文を生成して下さい。
        中学生レベルの英語で比較的簡単な、文法的に正しい文章を作成してください。
        5単語から10単語程度の長さで、自然な文章を生成してください。
        出力形式は、リスニング用の問題文のみです。"""
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

@app.post("/api/get/advice")
async def get_advice(data: Data):
    """
    ユーザーに対してアドバイスを提供するエンドポイント
    """
    password = await DB.password(data.id)
    if password is None or password != data.password:  # type: ignore
        return {"message": "password is wrong or user not found"}
    
    # 基本データ取得
    user_data = await DB.get_all(data.id)
    if not user_data:
        return {"advice": "学習データがありません"}
    
    # 正解・不正解データ取得
    correct_data = user_data.get("correct", {})
    bad_data = user_data.get("bad", {})
    
    # 今日の日付
    today = datetime.now().strftime("%Y年%m月%d日")
    
    # 総問題数計算
    total_correct = sum(sum(subjects.values()) for subjects in correct_data.values())
    total_bad = sum(sum(subjects.values()) for subjects in bad_data.values())
    total_problems = total_correct + total_bad
    
    if total_problems == 0:
        return {"advice": "まだ問題を解いていないようです。まずは問題にチャレンジしてみましょう！"}
    
    # 正答率計算
    accuracy = round((total_correct / total_problems) * 100, 1)
    
    # 科目別データ集計
    subject_stats = {}
    for date_data in correct_data.values():
        for subject, count in date_data.items():
            if subject not in subject_stats:
                subject_stats[subject] = {"correct": 0, "total": 0}
            subject_stats[subject]["correct"] += count
            subject_stats[subject]["total"] += count
    
    for date_data in bad_data.values():
        for subject, count in date_data.items():
            if subject not in subject_stats:
                subject_stats[subject] = {"correct": 0, "total": 0}
            subject_stats[subject]["total"] += count
    
    # 苦手科目特定
    weak_subjects = []
    for subject, stats in subject_stats.items():
        if stats["total"] >= 5:  # 5問以上やった科目のみ対象
            rate = (stats["correct"] / stats["total"]) * 100
            if rate < 60:  # 60%未満を苦手科目とする
                weak_subjects.append({"name": subject, "rate": round(rate, 1)})
    
    weak_subjects.sort(key=lambda x: x["rate"])  # 正答率が低い順
    
    # アドバイス生成用プロンプト
    prompt = f"""今日は{today}です。
        以下の学習データを基に、200字程度で学習アドバイスをお願いします。

        【学習状況】
        - 総問題数: {total_problems}問
        - 正答率: {accuracy}%
        - 正解数: {total_correct}問
        - 不正解数: {total_bad}問
        """
            
    if weak_subjects:
            prompt += f"\n【苦手分野】\n"
            for subject in weak_subjects[:2]:  # 上位2つまで
                prompt += f"- {subject['name']}: {subject['rate']}%\n"
        
            prompt += """
            具体的で実践的なアドバイスを簡潔にお願いします。
            """

    try:
        response = await reqAI(prompt, "gemini-2.5-flash")
        advice = response.replace("\n", "<br>")
        return {"advice": advice}
    except Exception as e:
        return {"advice": "アドバイス生成中にエラーが発生しました"}

# 教材ごとの範囲データを定義

def make_ranges(start, end, step, label_offset=0):
    """
    範囲リストを生成するユーティリティ関数
    start: 開始番号
    end: 終了番号
    step: ステップ幅
    label_offset: ラベルの開始番号調整（必要な場合のみ）
    """
    ranges = []
    s_list = list(range(start, end + 1, step))
    e_list = s_list[1:] + [end]
    for s, e in zip(s_list, e_list):
        ranges.append({"start": s, "end": e, "label": f"{s}-{e}"})
    return ranges

BOOK_RANGES = {
    "leap": make_ranges(1, 1935, 50),
    "systemeitango": make_ranges(1, 2027, 100),
    "target1000": make_ranges(1, 1000, 50),
    "target1200": make_ranges(1, 1700, 50),
    "target1400": make_ranges(1, 1400, 50),
    "target1900": make_ranges(1, 1900, 100),
}

@app.get("/api/get/ranges/{book_id}")
async def get_ranges(book_id: str):
    """
    教材IDに基づいて、その教材の問題範囲リストを返すAPI
    例: /api/get/ranges/target1200 で target1200 の範囲リストを取得
    """
    if book_id in BOOK_RANGES:
        return BOOK_RANGES.get(book_id, [])
    else:
        # ファイルパスを安全に構築
        safe_name = os.path.basename(book_id)
        path = f"./data/mondaiset/{safe_name}.txt"
        
        abs_path = os.path.abspath(path)
        intended_dir = os.path.abspath("./data/mondaiset")
        
        if not abs_path.startswith(intended_dir) or not os.path.isfile(abs_path):
            raise HTTPException(status_code=404, detail="Book not found")
            
        try:
            ranges = []
            current_label = None
            range_start_line = 1
            problem_count_in_range = 0
            total_problem_count = 0

            async with aiofiles.open(abs_path, mode="r", encoding="utf-8") as f:
                async for line in f:
                    line = line.strip()
                    if not line:
                        continue

                    if line.startswith('#'):
                        # 前の範囲を保存
                        if current_label is not None and problem_count_in_range > 0:
                            ranges.append({
                                "start": range_start_line,
                                "end": range_start_line + problem_count_in_range - 1,
                                "label": current_label
                            })
                            range_start_line += problem_count_in_range
                        
                        # 新しい範囲の開始
                        current_label = line.lstrip('#').strip()
                        problem_count_in_range = 0
                    else:
                        problem_count_in_range += 1
                        total_problem_count += 1
            
            # ファイル末尾の最後の範囲を保存
            if current_label is not None and problem_count_in_range > 0:
                ranges.append({
                    "start": range_start_line,
                    "end": range_start_line + problem_count_in_range - 1,
                    "label": current_label
                })

            # もし#区切りが一つもなければ、ファイル全体を一つの範囲として扱う
            if not ranges and total_problem_count > 0:
                 ranges.append({
                    "start": 1,
                    "end": total_problem_count,
                    "label": book_id # ラベルはbook_idにする
                })

            return ranges
            
        except FileNotFoundError:
            # このチェックは既にあるが、念のため
            raise HTTPException(status_code=404, detail="Book not found")
        except Exception as e:
            # サーバーログにエラーを出力するとデバッグに役立つ
            print(f"Error processing range file for {book_id}: {e}")
            raise HTTPException(status_code=500, detail="Error processing file")

@app.get("/api/get/ranges_progress/{book_id}")
async def get_ranges_progress(request: Request, book_id: str, ranges: str = Query(...)):
    """
    複数範囲の学習進捗を一括で取得するエンドポイント
    """
    userid = request.cookies.get("id")
    if not userid:
        raise HTTPException(status_code=401, detail="未ログイン")
    
    # 指定問題セットのプログレスデータを取得（1回だけ取得）
    progress = await DB.get_progress_data(userid, book_id)
    answered = set(progress.get("answeredQuestions", []))  # セットに変換して検索を高速化

    ranges_list = []
    for range_str in ranges.split(';'):
        if not range_str:
            continue
        start, end = map(int, range_str.split(','))
        
        # 効率的な検索のためのセット操作
        # 問題のインデックスは0始まりだが、範囲は1始まりなので調整
        learned = sum(1 for idx in answered if start <= idx + 1 <= end)
        total = end - start
        
        ranges_list.append({
            "start": start,
            "end": end,
            "learned": learned,
            "total": total
        })
    
    # 全体の統計も計算して返す
    total_learned = sum(r["learned"] for r in ranges_list)
    total_words = sum(r["total"] for r in ranges_list)
    
    return {
        "ranges": ranges_list,
        "overall": {
            "learned": total_learned,
            "total": total_words
        }
    }

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
