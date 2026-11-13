import unittest
import test_classroom as fixtures
from service import Classroom


class UnifiedChatTests(unittest.TestCase):
    setUp = fixtures.ClassroomTests.setUp
    tearDown = fixtures.ClassroomTests.tearDown

    def chat(self, user, action, **data):
        return self.app.run(user, action, data)

    def second_class(self, teacher=None):
        teacher = teacher or self.teacher
        course = self.chat(teacher, 'createClass', name='Second class', subject='CLOUD102')
        self.chat(self.students[0], 'joinClass', code=course['joinCode'])
        return course

    def test_same_pair_has_one_thread_across_classrooms(self):
        course = self.second_class()
        first = self.chat(self.students[0], 'sendMessage', classId=self.cid, text='First room')
        second = self.chat(self.teacher, 'sendMessage', classId=course['id'], studentUserId='s1', text='Second room')
        history = self.chat(self.students[0], 'getMessages', peerId='t')
        self.assertEqual(len(first), 1)
        self.assertEqual(len(second), 2)
        self.assertEqual([m['text'] for m in history], ['First room', 'Second room'])
        contact = self.chat(self.students[0], 'listConversations')[0]
        self.assertEqual(contact['peerId'], 't')
        self.assertEqual(len(contact['classes']), 2)

    def test_legacy_history_is_merged_without_deletion(self):
        course = self.second_class()
        for i, cid in enumerate([self.cid, course['id']]):
            message = {'entity': 'message', 'id': 'old' + str(i), 'senderId': 's1', 'senderName': 'Student One', 'text': 'Legacy ' + str(i), 'createdAt': f'2026-01-01T00:00:0{i}.000Z'}
            self.db.put('C#' + cid, 'DM#s1#' + message['createdAt'] + '#' + message['id'], message)
        history = self.chat(self.teacher, 'sendMessage', peerId='s1', text='New reply')
        self.assertEqual([m['text'] for m in history], ['Legacy 0', 'Legacy 1', 'New reply'])
        self.assertEqual(len(self.db.list('C#' + self.cid, 'DM#s1#')), 1)
        self.assertEqual(self.chat(self.teacher, 'listConversations')[0]['unreadCount'], 2)

    def test_unread_counts_only_incoming_and_only_clears_when_marked(self):
        self.chat(self.students[0], 'sendMessage', peerId='t', text='One')
        history = self.chat(self.students[0], 'sendMessage', peerId='t', text='Two')
        incoming = history[-1]
        self.chat(self.teacher, 'getMessages', peerId='s1')
        self.assertEqual(self.chat(self.teacher, 'listConversations')[0]['unreadCount'], 2)
        self.chat(self.teacher, 'sendMessage', peerId='s1', text='Reply')
        self.assertEqual(self.chat(self.teacher, 'listConversations')[0]['unreadCount'], 2)
        self.chat(self.teacher, 'markMessagesRead', peerId='s1', through=incoming['readKey'])
        self.assertEqual(self.chat(self.teacher, 'listConversations')[0]['unreadCount'], 0)
        self.assertEqual(self.chat(self.students[0], 'listConversations')[0]['unreadCount'], 1)

    def test_old_read_marker_does_not_hide_new_messages(self):
        first = self.chat(self.students[0], 'sendMessage', peerId='t', text='One')[-1]
        self.chat(self.teacher, 'markMessagesRead', peerId='s1', through=first['readKey'])
        second = self.chat(self.students[0], 'sendMessage', peerId='t', text='Two')[-1]
        self.chat(self.teacher, 'markMessagesRead', peerId='s1', through=first['readKey'])
        self.assertEqual(self.chat(self.teacher, 'listConversations')[0]['unreadCount'], 1)
        self.chat(self.teacher, 'markMessagesRead', peerId='s1', through=second['readKey'])
        self.chat(self.teacher, 'markMessagesRead', peerId='s1', through=first['readKey'])
        self.assertEqual(self.chat(self.teacher, 'listConversations')[0]['unreadCount'], 0)

    def test_latest_message_moves_contact_to_top_without_duplicate_contacts(self):
        self.second_class()
        self.chat(self.students[1], 'sendMessage', peerId='t', text='Latest student')
        inbox = self.chat(self.teacher, 'listConversations')
        self.assertEqual(len(inbox), 2)
        self.assertEqual(inbox[0]['peerId'], 's2')
        self.assertEqual(inbox[0]['unreadCount'], 1)
        self.chat(self.teacher, 'sendMessage', peerId='s1', text='Latest reply')
        self.assertEqual(self.chat(self.teacher, 'listConversations')[0]['peerId'], 's1')

    def test_student_cannot_access_other_students_or_unrelated_teacher(self):
        outsider = {'id': 'outsider', 'name': 'Other teacher', 'role': 'teacher'}
        for action in ('getMessages', 'sendMessage', 'markMessagesRead'):
            for user, peer in [(self.students[0], 's2'), (outsider, 's1')]:
                with self.subTest(action=action, user=user['id']), self.assertRaises(PermissionError):
                    self.chat(user, action, peerId=peer, text='forbidden', through='forged')

    def test_different_teachers_have_separate_private_threads(self):
        other = {'id': 't2', 'name': 'Other teacher', 'role': 'teacher'}
        self.second_class(other)
        self.chat(self.students[0], 'sendMessage', peerId='t', text='Only first teacher')
        self.chat(self.students[0], 'sendMessage', peerId='t2', text='Only second teacher')
        self.assertEqual([m['text'] for m in self.chat(self.teacher, 'getMessages', peerId='s1')], ['Only first teacher'])
        self.assertEqual([m['text'] for m in self.chat(other, 'getMessages', peerId='s1')], ['Only second teacher'])

    def test_read_state_persists_and_invalid_marker_is_rejected(self):
        message = self.chat(self.students[0], 'sendMessage', peerId='t', text='Message')[-1]
        with self.assertRaises(ValueError):
            self.chat(self.teacher, 'markMessagesRead', peerId='s1', through='not-a-message')
        self.chat(self.teacher, 'markMessagesRead', peerId='s1', through=message['readKey'])
        self.app = Classroom(self.db, fixtures.FakeFiles(), self.directory)
        self.assertEqual(self.chat(self.teacher, 'listConversations')[0]['unreadCount'], 0)
