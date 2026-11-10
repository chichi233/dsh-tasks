    /* ---------------------------------- 节假日（67） ---------------------------------- */

    /* 中国法定节假日与调休上班日，全部内置、运行时零网络。
       数据来源（逐年来自国务院办公厅正式发文，非媒体报道/预测）：
         2024 —《国务院办公厅关于 2024 年部分节假日安排的通知》国办发明电〔2023〕7 号，2023-10-25 发布
         2025 —《国务院办公厅关于 2025 年部分节假日安排的通知》国办发明电〔2024〕8 号，2024-11-12 发布
         2026 —《国务院办公厅关于 2026 年部分节假日安排的通知》（2025-11-04 发布，中国政府网）
       数据版本：2026-11。
       2027 年：正式通知截至本版本尚未发布（惯例为上一年 11 月发文，当前只有媒体预测），
       因此不内置 2027 —— 宁可缺，不猜。UI 在该年份用灰色省略号标注「未公布」。 */

    const HOLIDAY_DATA_VERSION = '2026-11';

    const HOLIDAY_YEARS = {
      2024: {
        notice: '国办发明电〔2023〕7 号（2023-10-25）',
        ranges: [
          ['2024-01-01', '2024-01-01', '元旦', '元旦'],
          ['2024-02-10', '2024-02-17', '春节', '春节'],
          ['2024-04-04', '2024-04-06', '清明节', '清明'],
          ['2024-05-01', '2024-05-05', '劳动节', '劳动'],
          ['2024-06-08', '2024-06-10', '端午节', '端午'],
          ['2024-09-15', '2024-09-17', '中秋节', '中秋'],
          ['2024-10-01', '2024-10-07', '国庆节', '国庆']
        ],
        makeup: [
          '2024-02-04',
          '2024-02-18',
          '2024-04-07',
          '2024-04-28',
          '2024-05-11',
          '2024-09-14',
          '2024-09-29',
          '2024-10-12'
        ]
      },
      2025: {
        notice: '国办发明电〔2024〕8 号（2024-11-12）',
        ranges: [
          ['2025-01-01', '2025-01-01', '元旦', '元旦'],
          ['2025-01-28', '2025-02-04', '春节', '春节'],
          ['2025-04-04', '2025-04-06', '清明节', '清明'],
          ['2025-05-01', '2025-05-05', '劳动节', '劳动'],
          ['2025-05-31', '2025-06-02', '端午节', '端午'],
          ['2025-10-01', '2025-10-08', '国庆节', '国庆'],
          ['2025-10-06', '2025-10-06', '中秋节', '中秋']
        ],
        makeup: ['2025-01-26', '2025-02-08', '2025-04-27', '2025-09-28', '2025-10-11']
      },
      2026: {
        notice: '2026 年通知（2025-11-04 发布）',
        ranges: [
          ['2026-01-01', '2026-01-03', '元旦', '元旦'],
          ['2026-02-15', '2026-02-23', '春节', '春节'],
          ['2026-04-04', '2026-04-06', '清明节', '清明'],
          ['2026-05-01', '2026-05-05', '劳动节', '劳动'],
          ['2026-06-19', '2026-06-21', '端午节', '端午'],
          ['2026-09-25', '2026-09-27', '中秋节', '中秋'],
          ['2026-10-01', '2026-10-07', '国庆节', '国庆']
        ],
        makeup: ['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10']
      }
    };

    let HOLIDAY_INDEX = null;

    /* 展开成 dateKey → { name 全名, short 短名 } 与 makeup 命中表；
       后出现的条目覆盖前者（如 2025-10-06 中秋落在国庆 8 天假期内）。 */
    function holidayIndex() {
      if (HOLIDAY_INDEX) return HOLIDAY_INDEX;
      const index = { days: {}, makeup: {}, years: {} };
      Object.keys(HOLIDAY_YEARS).forEach(function (key) {
        const year = Number(key);
        const src = HOLIDAY_YEARS[key];
        index.years[year] = src.notice;
        src.ranges.forEach(function (row) {
          let day = parseISO(row[0]);
          const end = parseISO(row[1]);
          let guard = 0;
          while (day && end && day.getTime() <= end.getTime() && guard < 40) {
            index.days[dateKey(day)] = { name: row[2], short: row[3] };
            day = addDays(day, 1);
            guard += 1;
          }
        });
        src.makeup.forEach(function (date) {
          index.makeup[date] = true;
        });
      });
      /* 除夕 = 腊月最后一天（次日为正月初一）。节假日起始日恰好是除夕时按除夕显示，
         新年份的除夕日期随农历表自动跟随，不写死在数据里。 */
      Object.keys(index.days).forEach(function (key) {
        const day = parseISO(key);
        const info = lunarOf(day);
        if (!info || info.lunarMonth !== 12 || info.monthStart) return;
        const next = lunarOf(addDays(day, 1));
        if (next && next.monthStart && next.lunarMonth === 1) {
          index.days[key] = { name: '除夕', short: '除夕' };
        }
      });
      HOLIDAY_INDEX = index;
      return index;
    }

    function holidayOf(date) {
      return holidayIndex().days[dateKey(date)] || null;
    }

    function isMakeupDay(date) {
      return !!holidayIndex().makeup[dateKey(date)];
    }

    function holidayCovered(year) {
      return !!holidayIndex().years[year];
    }

    function holidayNotice(year) {
      return holidayIndex().years[year] || '';
    }
